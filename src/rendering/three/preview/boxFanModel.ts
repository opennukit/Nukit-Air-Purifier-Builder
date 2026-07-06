import { Box3, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { sceneScale } from "@/rendering/three/preview/previewData";

// #######################################
// Box Fan Preview
// #######################################
//
// The 20" box fan ("filter cube") 3D model shown sitting on top of the four-side
// tower when the build runs a box/exhaust fan. Preview-only purchased-part visual,
// decimated from the supplied CAD (mm units). The propeller spins via the shared
// fan-rotor loop. Geometry is cached and shared across rebuilds (marked
// sharedCadGeometry so the preview's disposer leaves it alone); materials are
// per-build so they dispose cleanly.

const boxFanAssetUrl = "/vendor/box-fan/box-fan.glb";

// The supplied CAD is a 20" box fan whose frame measures ~554 mm across. The glb
// exporter rescaled the raw units, so rather than trust them we normalise the
// loaded footprint to this real width (mm) and then apply the mm -> scene scale.
const boxFanFrameWidthMm = 554;

let boxFanScenePromise: Promise<Object3D> | null = null;

function loadBoxFanScene(): Promise<Object3D> {
  boxFanScenePromise ??= new GLTFLoader().loadAsync(boxFanAssetUrl).then((gltf) => {
    // The decimated glb ships without normals; compute them once on the shared
    // geometry so every clone is lit correctly.
    gltf.scene.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh && mesh.geometry.getAttribute("normal") === undefined) {
        mesh.geometry.computeVertexNormals();
      }
    });
    return gltf.scene;
  });
  return boxFanScenePromise;
}

export type BoxFanPreviewParams = {
  // Scene-space point where the fan's bottom centre sits: the top of the box,
  // centred over the exhaust hole.
  readonly bottomCenter: Vector3;
  // Extra upward displacement (scene units) applied in the exploded view.
  readonly explodedUpOffset: number;
  // Called once the propeller pivot exists, so the caller can register it with
  // the shared rotor-spin loop (guarded against stale rebuilds by the caller).
  readonly onRotorReady: (rotor: Object3D) => void;
};

// Returns the mount group immediately (positioned/scaled); the CAD loads
// asynchronously and fills it in, no-opping if the mount was disposed meanwhile.
export function createBoxFanPreview(params: BoxFanPreviewParams): Group {
  const mount = new Group();
  mount.name = "box-fan-preview";
  mount.position.copy(params.bottomCenter);
  mount.position.y += params.explodedUpOffset;

  void loadBoxFanScene()
    .then((cached) => {
      if (mount.userData["disposedPreviewObject"] === true) {
        return;
      }
      const fan = cached.clone(true);
      const bodyMaterial = new MeshStandardMaterial({ color: 0xd7d9dc, roughness: 0.66, metalness: 0.04 });
      fan.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh) {
          mesh.material = bodyMaterial;
          mesh.userData["sharedCadGeometry"] = true;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });

      // Stand the fan up so its airflow axis (the thinnest dimension = depth) points
      // up, and flip it so the (kept front) grille faces up, exhaling upward.
      const rawSize = new Box3().setFromObject(fan).getSize(new Vector3());
      if (rawSize.z <= rawSize.x && rawSize.z <= rawSize.y) {
        fan.rotation.x = -Math.PI / 2;
      } else if (rawSize.x <= rawSize.y && rawSize.x <= rawSize.z) {
        fan.rotation.z = -Math.PI / 2;
      } else {
        fan.rotation.x = Math.PI;
      }
      fan.updateWorldMatrix(true, true);

      // Normalise the (rescaled) glb footprint to the real frame width in mm, then
      // apply the shared mm -> scene scale so the fan matches the box's size.
      const bounds = new Box3().setFromObject(fan);
      const footprint = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) || 1;
      mount.scale.setScalar((boxFanFrameWidthMm / footprint) * sceneScale);

      // Centre on the PROPELLER HUB (not the frame's bbox centre, which the handle
      // and control knob skew) so the hub lands over the exhaust hole, and drop the
      // fan's bottom onto y=0 so it sits on the box top.
      const propeller = findByName(fan, /propeller|impeller|blade/i);
      const hub = propeller !== null ? meshesCentroidWorld(propeller) : bounds.getCenter(new Vector3());
      fan.position.x -= hub.x;
      fan.position.z -= hub.z;
      fan.position.y -= bounds.min.y;
      mount.add(fan);
      mount.updateWorldMatrix(true, true);

      // Spin the propeller about the (now vertical) airflow axis. A pivot whose
      // local +Y is the mount's up axis lets the shared rotor loop (rotation.y)
      // spin it; anchor it on the propeller's vertex centroid (the hub axis).
      if (propeller !== null) {
        const pivot = new Group();
        pivot.name = "box-fan-rotor";
        pivot.userData["fanRotor"] = true;
        pivot.position.copy(mount.worldToLocal(meshesCentroidWorld(propeller)));
        mount.add(pivot);
        pivot.attach(propeller);
        params.onRotorReady(pivot);
      }
    })
    .catch(() => {
      // A failed asset load just leaves the box fan absent; the rest of the
      // preview is unaffected.
    });

  return mount;
}

function findByName(root: Object3D, pattern: RegExp): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((object) => {
    if (found === null && object.name !== "" && pattern.test(object.name)) {
      found = object;
    }
  });
  return found;
}

function meshesCentroidWorld(root: Object3D): Vector3 {
  root.updateWorldMatrix(true, true);
  const vertex = new Vector3();
  const sum = new Vector3();
  let count = 0;
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (mesh.isMesh) {
      const position = mesh.geometry.getAttribute("position");
      for (let i = 0; i < position.count; i += 1) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        sum.add(vertex);
        count += 1;
      }
    }
  });
  return count > 0 ? sum.multiplyScalar(1 / count) : sum;
}
