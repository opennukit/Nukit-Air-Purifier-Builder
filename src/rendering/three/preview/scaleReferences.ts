import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  bananaReferenceLength,
  bananaReferenceRadius,
  bananaScaleAssetUrl,
  oneMeterCubeSize,
} from "@/rendering/three/preview/previewData";

// #######################################
// Scale References
// #######################################

// The banana and one-meter-cube scale references shown next to the model, plus
// the mesh-resource clone/dispose helpers they and the preview class share.

export function createBananaScaleReference(): Group {
  const group = new Group();
  group.name = "banana-for-scale";

  const placeholder = createBananaScaleBoundsPlaceholder();
  group.add(placeholder);

  void loadBananaScaleAsset()
    .then((asset) => {
      if (group.userData["disposedPreviewObject"] === true) {
        return;
      }
      group.remove(placeholder);
      disposeMeshResources(placeholder);
      group.add(createNormalizedBananaScaleAsset(asset));
    })
    .catch(() => {
      if (group.userData["disposedPreviewObject"] === true) {
        return;
      }
      placeholder.material.opacity = 0.16;
      placeholder.material.color.set(0xf5c84b);
    });

  return group;
}

function createBananaScaleBoundsPlaceholder(): Mesh<BoxGeometry, MeshBasicMaterial> {
  const placeholder = new Mesh(
    new BoxGeometry(bananaReferenceLength, bananaReferenceRadius * 1.8, bananaReferenceRadius * 2.6),
    new MeshBasicMaterial({
      color: 0xf5c84b,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  placeholder.name = "banana-scale-bounds-placeholder";
  placeholder.position.y = (bananaReferenceRadius * 1.8) / 2;
  return placeholder;
}

let bananaScaleAssetPromise: Promise<Object3D> | null = null;

function loadBananaScaleAsset(): Promise<Object3D> {
  bananaScaleAssetPromise ??= new GLTFLoader().loadAsync(bananaScaleAssetUrl).then((gltf) => gltf.scene);
  return bananaScaleAssetPromise;
}

function createNormalizedBananaScaleAsset(asset: Object3D): Object3D {
  const clone = cloneObjectWithOwnMeshResources(asset);
  const rawSize = new Box3().setFromObject(clone).getSize(new Vector3());
  if (rawSize.z >= rawSize.x && rawSize.z >= rawSize.y) {
    clone.rotation.y = Math.PI / 2;
  } else if (rawSize.y >= rawSize.x && rawSize.y >= rawSize.z) {
    clone.rotation.z = -Math.PI / 2;
  }
  clone.rotation.x += 0.04;
  clone.updateWorldMatrix(true, true);

  const initialBounds = new Box3().setFromObject(clone);
  const initialSize = initialBounds.getSize(new Vector3());
  const scale = bananaReferenceLength / Math.max(initialSize.x, 0.001);
  clone.scale.setScalar(scale);
  clone.updateWorldMatrix(true, true);

  const scaledBounds = new Box3().setFromObject(clone);
  const scaledCenter = scaledBounds.getCenter(new Vector3());
  clone.position.sub(new Vector3(scaledCenter.x, scaledBounds.min.y, scaledCenter.z));
  clone.traverse((child) => {
    if (child instanceof Mesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return clone;
}

export function createOneMeterScaleCube(): Group {
  const group = new Group();
  group.name = "one-meter-scale-cube";

  const geometry = new BoxGeometry(oneMeterCubeSize, oneMeterCubeSize, oneMeterCubeSize);
  const material = new MeshStandardMaterial({
    color: 0xdad3bc,
    roughness: 0.68,
    metalness: 0.02,
    transparent: true,
    opacity: 0.16,
  });
  const cube = new Mesh(geometry, material);
  cube.name = "one-meter-scale-cube-body";
  cube.position.y = oneMeterCubeSize / 2;
  cube.castShadow = true;
  cube.receiveShadow = true;
  group.add(cube);

  const edges = new LineSegments(
    new EdgesGeometry(geometry),
    new LineBasicMaterial({ color: 0x4f584e, transparent: true, opacity: 0.82 }),
  );
  edges.position.copy(cube.position);
  group.add(edges);
  for (const label of createOneMeterCubeFaceLabels()) {
    group.add(label);
  }

  return group;
}

function createOneMeterCubeFaceLabels(): Object3D[] {
  const label = createScaleLabelTexture("1 m cube");
  const material = new MeshBasicMaterial({
    map: label,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
  const width = oneMeterCubeSize * 0.88;
  const height = oneMeterCubeSize * 0.18;
  const faceInset = 0.006;
  const frontLabel = new Mesh(new PlaneGeometry(width, height), material.clone());
  frontLabel.name = "one-meter-scale-cube-front-label";
  frontLabel.position.set(0, oneMeterCubeSize * 0.62, oneMeterCubeSize / 2 + faceInset);

  const rightLabel = new Mesh(new PlaneGeometry(width, height), material.clone());
  rightLabel.name = "one-meter-scale-cube-side-label";
  rightLabel.rotation.y = Math.PI / 2;
  rightLabel.position.set(oneMeterCubeSize / 2 + faceInset, oneMeterCubeSize * 0.62, 0);

  return [frontLabel, rightLabel];
}

function createScaleLabelTexture(text: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 224;
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error("createScaleLabelTexture: Could not create canvas context");
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255, 253, 246, 0.9)";
  roundRect(context, 28, 28, 968, 168, 44);
  context.fill();
  context.strokeStyle = "rgba(31, 111, 86, 0.72)";
  context.lineWidth = 8;
  roundRect(context, 28, 28, 968, 168, 44);
  context.stroke();
  context.fillStyle = "#111817";
  context.font = "900 118px Inter, Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function cloneObjectWithOwnMeshResources(object: Object3D): Object3D {
  const clone = object.clone(true);
  clone.traverse((child) => {
    if (child instanceof Mesh) {
      child.geometry = child.geometry.clone();
      child.material = cloneMaterial(child.material);
    }
  });
  return clone;
}

function cloneMaterial(material: Material | Material[]): Material | Material[] {
  if (Array.isArray(material)) {
    return material.map((entry) => entry.clone());
  }
  return material.clone();
}

function disposeMeshResources(mesh: Mesh): void {
  mesh.geometry.dispose();
  disposeMaterial(mesh.material, new Set());
}

export function disposeMaterial(material: Material | Material[], seenMaterials: Set<Material>): void {
  if (Array.isArray(material)) {
    for (const entry of material) {
      disposeSingleMaterial(entry, seenMaterials);
    }
    return;
  }
  disposeSingleMaterial(material, seenMaterials);
}

function disposeSingleMaterial(material: Material, seenMaterials: Set<Material>): void {
  if (seenMaterials.has(material)) {
    return;
  }
  seenMaterials.add(material);
  if (
    material instanceof MeshBasicMaterial ||
    material instanceof MeshStandardMaterial ||
    material instanceof MeshPhysicalMaterial ||
    material instanceof SpriteMaterial
  ) {
    material.map?.dispose();
  }
  material.dispose();
}
