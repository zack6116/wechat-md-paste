export async function filesFromDataTransfer(dataTransfer) {
  const items = [...(dataTransfer?.items || [])];
  const entries = items
    .map((item) => (item.kind === 'file' ? item.webkitGetAsEntry?.() : null))
    .filter(Boolean);
  if (entries.length) {
    const files = [];
    await Promise.all(entries.map((entry) => walkEntry(entry, '', files)));
    if (files.length) return files;
  }
  return [...(dataTransfer?.files || [])].map((file) => ({
    file,
    name: file.name,
    relativePath: file.webkitRelativePath || file.name,
  }));
}

export function entriesFromFileList(fileList) {
  return [...(fileList || [])].map((file) => ({
    file,
    name: file.name,
    relativePath: file.webkitRelativePath || file.name,
  }));
}

function walkEntry(entry, prefix, files) {
  const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      entry.file((file) => {
        files.push({ file, name: file.name, relativePath });
        resolve();
      }, reject);
    });
  }
  if (!entry.isDirectory) return Promise.resolve();
  return readAllEntries(entry).then((children) =>
    Promise.all(children.map((child) => walkEntry(child, relativePath, files))),
  );
}

function readAllEntries(directory) {
  return new Promise((resolve, reject) => {
    const reader = directory.createReader();
    const all = [];
    const read = () => {
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(all);
          return;
        }
        all.push(...batch);
        read();
      }, reject);
    };
    read();
  });
}
