/**
 * Every file in a drop, including the files inside any dropped folders (and their subfolders).
 * `dataTransfer.files` alone lists a folder as one useless empty "file".
 */
export async function droppedFiles(dataTransfer: DataTransfer): Promise<File[]> {
  // Start reading every item before the first await: the browser empties dataTransfer after that
  const reading = Array.from(dataTransfer.items, (item) => {
    const entry = item.webkitGetAsEntry();
    if (entry) return filesIn(entry);
    const file = item.getAsFile(); // no entry (e.g. a drop made in code): take the plain file
    return Promise.resolve(file ? [file] : []);
  });
  const nested = await Promise.all(reading);
  return nested.flat();
}

async function filesIn(entry: FileSystemEntry): Promise<File[]> {
  if (isFile(entry)) return [await readFile(entry)];
  if (!isDirectory(entry)) return [];
  const children = await readAll(entry.createReader());
  const nested = await Promise.all(children.map(filesIn));
  return nested.flat();
}

/** The callback APIs below are older than promises, so each one gets wrapped in a Promise. */
function readFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** readEntries answers in batches (about 100 at a time), so keep asking until one is empty. */
async function readAll(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) return all;
    all.push(...batch);
  }
}

const isFile = (entry: FileSystemEntry): entry is FileSystemFileEntry => entry.isFile;
const isDirectory = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry =>
  entry.isDirectory;
