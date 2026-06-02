<script lang="ts">
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import type { PrintableMesh } from "@/fabrication/printing/printableKit";

  let { mesh }: { mesh: PrintableMesh } = $props();

  let container: HTMLDivElement;
  let scene: THREE.Scene | undefined;
  let camera: THREE.PerspectiveCamera | undefined;
  let modelMesh: THREE.Mesh | undefined;
  let hasFramed = false;

  function toBufferGeometry(source: PrintableMesh): THREE.BufferGeometry {
    const positions = new Float32Array(source.vertices.length * 3);
    source.vertices.forEach((vertex, index) => {
      positions[index * 3] = vertex.x;
      positions[index * 3 + 1] = vertex.y;
      positions[index * 3 + 2] = vertex.z;
    });
    const indices = new Uint32Array(source.triangles.length * 3);
    source.triangles.forEach((triangle, index) => {
      indices[index * 3] = triangle.v1;
      indices[index * 3 + 1] = triangle.v2;
      indices[index * 3 + 2] = triangle.v3;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }

  // Build the renderer/scene/camera once and drive the render loop.
  $effect(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x161a20);

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 1, 8000);
    camera.up.set(0, 0, 1); // model is Z-up
    camera.position.set(500, -650, 480);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(0.6, -1, 1.4);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    scene.add(new THREE.GridHelper(800, 16, 0x2c333d, 0x222831).rotateX(Math.PI / 2));

    let frame = 0;
    const renderLoop = () => {
      frame = requestAnimationFrame(renderLoop);
      controls.update();
      renderer.render(scene!, camera!);
    };
    renderLoop();

    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera!.aspect = container.clientWidth / container.clientHeight;
      camera!.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene = undefined;
      camera = undefined;
      modelMesh = undefined;
    };
  });

  // Rebuild the model mesh whenever the geometry changes; only frame the camera
  // on the first build so tweaking parameters doesn't reset the user's orbit.
  $effect(() => {
    const activeScene = scene;
    if (activeScene === undefined) {
      return;
    }
    if (modelMesh !== undefined) {
      activeScene.remove(modelMesh);
      modelMesh.geometry.dispose();
    }
    const geometry = toBufferGeometry(mesh);
    const center = geometry.boundingSphere?.center ?? new THREE.Vector3();
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.computeBoundingSphere();
    modelMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: 0xb8c4d8, flatShading: true, metalness: 0.05, roughness: 0.85 }),
    );
    activeScene.add(modelMesh);

    if (!hasFramed && camera !== undefined) {
      const radius = geometry.boundingSphere?.radius ?? 300;
      camera.position.set(radius * 1.5, -radius * 1.9, radius * 1.3);
      camera.lookAt(0, 0, 0);
      hasFramed = true;
    }
  });
</script>

<div class="viewport" bind:this={container}></div>

<style>
  .viewport {
    width: 100%;
    height: 100%;
    min-height: 0;
  }
</style>
