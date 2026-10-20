import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

describe('sanity', () => {
  it('runs tests and can import three', () => {
    const v = new THREE.Vector3(3, 4, 0);
    expect(v.length()).toBe(5);
  });
});
