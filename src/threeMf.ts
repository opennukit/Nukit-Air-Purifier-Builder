export type MeshVertex = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type MeshTriangle = {
  readonly v1: number;
  readonly v2: number;
  readonly v3: number;
};

export type MeshObject = {
  readonly name: string;
  readonly vertices: readonly MeshVertex[];
  readonly triangles: readonly MeshTriangle[];
  readonly position: MeshVertex;
};

const modelPath = "3D/3dmodel.model";
const mimeType = "application/vnd.ms-package.3dmanufacturing-3dmodel+xml";
const crcTable = createCrcTable();
const textEncoder = new TextEncoder();

export type StoredZipFile = {
  readonly name: string;
  readonly content: Uint8Array;
};

export function createThreeMfPackage(title: string, objects: readonly MeshObject[]): Uint8Array {
  return createStoredZipPackage([
    textZipFile("[Content_Types].xml", contentTypesXml()),
    textZipFile("_rels/.rels", relationshipsXml()),
    textZipFile(modelPath, modelXml(title, objects)),
  ]);
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model" ContentType="${mimeType}"/>
</Types>`;
}

function relationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/${modelPath}" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
}

function modelXml(title: string, objects: readonly MeshObject[]): string {
  const resources = objects
    .map((object, index) => objectXml(index + 1, object))
    .join("\n");
  const buildItems = objects
    .map((object, index) => {
      const position = [
        formatNumber(object.position.x),
        formatNumber(object.position.y),
        formatNumber(object.position.z),
      ].join(" ");
      const transform = `1 0 0 0 1 0 0 0 1 ${position}`;
      return `    <item objectid="${index + 1}" transform="${transform}"/>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Title">${escapeXml(title)}</metadata>
  <resources>
${resources}
  </resources>
  <build>
${buildItems}
  </build>
</model>`;
}

function objectXml(objectId: number, object: MeshObject): string {
  const vertices = object.vertices
    .map((vertex) => {
      return `        <vertex x="${formatNumber(vertex.x)}" y="${formatNumber(vertex.y)}" z="${formatNumber(vertex.z)}"/>`;
    })
    .join("\n");
  const triangles = object.triangles
    .map((triangle) => {
      return `        <triangle v1="${triangle.v1}" v2="${triangle.v2}" v3="${triangle.v3}"/>`;
    })
    .join("\n");

  return `    <object id="${objectId}" type="model" name="${escapeXml(object.name)}">
      <mesh>
        <vertices>
${vertices}
        </vertices>
        <triangles>
${triangles}
        </triangles>
      </mesh>
    </object>`;
}

type PreparedZipFile = {
  readonly name: string;
  readonly content: Uint8Array;
  readonly crc: number;
};

type CentralDirectoryEntry = {
  readonly file: PreparedZipFile;
  readonly localHeaderOffset: number;
};

function textZipFile(name: string, content: string): StoredZipFile {
  return {
    name,
    content: textEncoder.encode(content),
  };
}

export function createStoredZipPackage(files: readonly StoredZipFile[]): Uint8Array {
  return createZip(files.map(prepareZipFile));
}

function prepareZipFile(file: StoredZipFile): PreparedZipFile {
  return {
    ...file,
    crc: crc32(file.content),
  };
}

function createZip(files: readonly PreparedZipFile[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralEntries: CentralDirectoryEntry[] = [];
  let offset = 0;

  for (const file of files) {
    const localHeader = createLocalFileHeader(file);
    localParts.push(localHeader, file.content);
    centralEntries.push({ file, localHeaderOffset: offset });
    offset += localHeader.length + file.content.length;
  }

  const centralParts = centralEntries.map(createCentralDirectoryHeader);
  const centralDirectorySize = centralParts.reduce((total, part) => total + part.length, 0);
  const endRecord = createEndOfCentralDirectory(files.length, centralDirectorySize, offset);
  return concatBytes([...localParts, ...centralParts, endRecord]);
}

function createLocalFileHeader(file: PreparedZipFile): Uint8Array {
  const filename = textEncoder.encode(file.name);
  const header = new Uint8Array(30 + filename.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, file.crc, true);
  view.setUint32(18, file.content.length, true);
  view.setUint32(22, file.content.length, true);
  view.setUint16(26, filename.length, true);
  view.setUint16(28, 0, true);
  header.set(filename, 30);
  return header;
}

function createCentralDirectoryHeader(entry: CentralDirectoryEntry): Uint8Array {
  const filename = textEncoder.encode(entry.file.name);
  const header = new Uint8Array(46 + filename.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, entry.file.crc, true);
  view.setUint32(20, entry.file.content.length, true);
  view.setUint32(24, entry.file.content.length, true);
  view.setUint16(28, filename.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, entry.localHeaderOffset, true);
  header.set(filename, 46);
  return header;
}

function createEndOfCentralDirectory(fileCount: number, centralDirectorySize: number, centralDirectoryOffset: number): Uint8Array {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return record;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(totalLength);
  let cursor = 0;
  for (const part of parts) {
    result.set(part, cursor);
    cursor += part.length;
  }
  return result;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatNumber(value: number): string {
  return Number(value.toFixed(4)).toString();
}
