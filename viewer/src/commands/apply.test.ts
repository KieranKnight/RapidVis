import { AnimationClip, Group, Mesh, PointLight, Quaternion, VectorKeyframeTrack } from 'three';
import { describe, expect, it } from 'vitest';
import { SceneRegistry, type SceneNode } from '../registry';
import { applyCommand, replay, stillValue, type ShotContext, type ShotState } from './apply';
import type { Command } from './parse';

const root = new Group();
const light = new PointLight();
light.name = 'Key_Light'; // how three.js names a Blender object called "Key Light"
const ground = new Mesh();
ground.name = 'ground';
ground.position.set(1, 2, 3);
root.add(light, ground);
const context: ShotContext = {
  registry: new SceneRegistry(root, { 'Key Light': 'Key Light' }),
  fps: 10, // keeps the frame <-> seconds maths easy to read
};
const groundNode = context.registry.nodes.find((n) => n.id === 'ground') as SceneNode;

// The light's position has keys at 0s and 2s (frames 0 and 20). The ground isn't animated.
const original: ShotState = {
  clips: [
    new AnimationClip('shot', -1, [
      new VectorKeyframeTrack('Key_Light.position', [0, 2], [0, 0, 0, 1, 1, 1]),
    ]),
  ],
  frameStart: 0,
  frameEnd: 20,
  poses: {},
};

const retimeLight = (factor: number): Command => ({ verb: 'retime', target: 'Key Light', factor });
const offsetLight = (frames: number): Command => ({ verb: 'offset', target: 'Key Light', frames });

/** Replays the commands from the original and returns the edited state. */
function run(commands: Command[]) {
  const result = replay(original, commands, context);
  if (result.errors.length > 0) throw new Error(result.errors.join('\n'));
  return result.state;
}

/** Replays the commands and returns the light's key times. */
const timesAfter = (commands: Command[]) => Array.from(run(commands).clips[0].tracks[0].times);

/** Replays the commands and returns the light's position keys. */
const positionsAfter = (commands: Command[]) => Array.from(run(commands).clips[0].tracks[0].values);

/** Compares number lists with a little tolerance. */
function expectClose(actual: ArrayLike<number> | null, expected: number[]) {
  expect(actual).not.toBeNull();
  expected.forEach((value, i) => expect(actual![i]).toBeCloseTo(value, 6));
}

describe('retime and offset', () => {
  it('retimes using the glTF track name, not the DCC name', () => {
    expect(timesAfter([retimeLight(2)])).toEqual([0, 1]);
  });

  it('is absolute: each retime is relative to the original speed, not the last one', () => {
    expect(timesAfter([retimeLight(2), retimeLight(4)])).toEqual([0, 0.5]);
  });

  it('retiming back to 1 restores the original timing', () => {
    const times = timesAfter([1.5, 0.1, 0.5, 1].map(retimeLight));
    expect(times[0]).toBe(0);
    expect(times[1]).toBeCloseTo(2, 6);
  });

  it('offsets in frames, using the fps', () => {
    expect(timesAfter([offsetLight(5)])).toEqual([0.5, 2.5]);
  });

  it('offset is absolute too: offset 0 puts it back', () => {
    expect(timesAfter([offsetLight(5), offsetLight(-10)])).toEqual([-1, 1]);
    expect(timesAfter([offsetLight(5), offsetLight(0)])).toEqual([0, 2]);
  });

  it('a retime after an offset keeps the new start (it pivots on the first key)', () => {
    expect(timesAfter([offsetLight(10), retimeLight(2)])).toEqual([1, 2]);
  });

  it('an offset after a retime moves the faster animation', () => {
    expect(timesAfter([retimeLight(2), offsetLight(10)])).toEqual([1, 2]);
  });

  it('explains when the object has no animation', () => {
    const command: Command = { verb: 'retime', target: 'ground', factor: 2 };
    expect(applyCommand(original, command, context, [])).toEqual({
      error: '"ground" has no animation to retime',
    });
  });
});

describe('trim', () => {
  it('changes the frame range and leaves the clips alone', () => {
    const command: Command = { verb: 'trim', start: 5, end: 15 };
    const result = applyCommand(original, command, context, []);
    if ('error' in result) throw new Error(result.error);
    expect(result.ok).toMatchObject({ frameStart: 5, frameEnd: 15 });
    expect(result.ok.clips).toBe(original.clips);
  });
});

describe('move-all, rotate-all, scale-all', () => {
  const moveLight = (z: number): Command => ({
    verb: 'move-all',
    target: 'Key Light',
    by: [0, 0, z],
  });

  it("moves every key of an animated object, in Blender's axes (Z up = glTF Y up)", () => {
    expect(positionsAfter([moveLight(2)])).toEqual([0, 2, 0, 1, 3, 1]);
  });

  it('is absolute: the latest move wins, and 0 0 0 puts it back', () => {
    expect(positionsAfter([moveLight(2), moveLight(5)])).toEqual([0, 5, 0, 1, 6, 1]);
    expect(positionsAfter([moveLight(2), moveLight(0)])).toEqual([0, 0, 0, 1, 1, 1]);
  });

  it("moves an object that isn't animated by editing its still pose", () => {
    const state = run([{ verb: 'move-all', target: 'ground', by: [0, 0, 2] }]);
    expect(state.clips).toBe(original.clips);
    expectClose(stillValue(state, groundNode, 'position'), [1, 4, 3]);
  });

  it('rotates, and rotating back to 0 0 0 restores the original', () => {
    const turn: Command = { verb: 'rotate-all', target: 'ground', by: [0, 0, 90] };
    const back: Command = { verb: 'rotate-all', target: 'ground', by: [0, 0, 0] };
    const quarterTurnAroundUp = new Quaternion(0, Math.SQRT1_2, 0, Math.SQRT1_2).toArray();
    expectClose(stillValue(run([turn]), groundNode, 'quaternion'), quarterTurnAroundUp);
    expectClose(stillValue(run([turn, back]), groundNode, 'quaternion'), [0, 0, 0, 1]);
  });

  it('scales (Y and Z swap into glTF axes), and the latest scale wins', () => {
    const scale = (by: [number, number, number]): Command => ({
      verb: 'scale-all',
      target: 'ground',
      by,
    });
    expectClose(stillValue(run([scale([1, 2, 3])]), groundNode, 'scale'), [1, 3, 2]);
    expectClose(
      stillValue(run([scale([1, 2, 3]), scale([2, 2, 2])]), groundNode, 'scale'),
      [2, 2, 2],
    );
  });

  it('refuses to scale cameras and lights', () => {
    const command: Command = { verb: 'scale-all', target: 'Key Light', by: [2, 2, 2] };
    expect(applyCommand(original, command, context, [])).toEqual({
      error: '"Key Light" is a light, and those can\'t be scaled',
    });
  });

  it('stillValue is null for animated properties (the mixer is in charge of those)', () => {
    const lightNode = context.registry.nodes.find((n) => n.id === 'Key Light') as SceneNode;
    expect(stillValue(original, lightNode, 'position')).toBeNull();
    expect(stillValue(original, groundNode, 'position')).toEqual([1, 2, 3]);
  });
});

describe('replay', () => {
  it('gives the same result every time and never changes the originals', () => {
    const commands = [retimeLight(2), offsetLight(3)];
    expect(timesAfter(commands)).toEqual(timesAfter(commands));
    expect(Array.from(original.clips[0].tracks[0].times)).toEqual([0, 2]);
  });

  it('with no commands, gives back the original', () => {
    expect(replay(original, [], context).state).toBe(original);
  });

  it('the latest trim wins', () => {
    const commands: Command[] = [
      { verb: 'trim', start: 2, end: 8 },
      { verb: 'trim', start: 4, end: 18 },
    ];
    expect(run(commands)).toMatchObject({ frameStart: 4, frameEnd: 18 });
  });

  it('skips commands that no longer apply, and reports them', () => {
    const ground: Command = { verb: 'retime', target: 'ground', factor: 2 };
    const result = replay(original, [ground, retimeLight(2)], context);
    expect(result.errors).toEqual(['"ground" has no animation to retime']);
    expect(Array.from(result.state.clips[0].tracks[0].times)).toEqual([0, 1]);
  });
});
