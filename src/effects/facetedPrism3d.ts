import * as THREE from 'three';
import type { PrismFrame } from '../vision/prismEngine';
import { clamp, polygonCenter, type Point } from '../utils/math';
import type { PresetId } from './presets';
import type { RenderQuality } from './renderQuality';
import { renderSurfaceEffectCanvas, type SurfaceEffectId } from './surfaceEffects';

export type FacetedPrismRenderOptions = {
  faceEffectIds: PresetId[];
  overlapEffectId: SurfaceEffectId | null;
  timeMs: number;
  intensity: number;
  quality: RenderQuality;
};

type LocalPoint = {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
};

export function createFacetedPrismRenderer() {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1200, 1200);
  const group = new THREE.Group();
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0xf7f7f7,
    transparent: true,
    opacity: 0.16,
    depthTest: true,
  });
  let lastWidth = 0;
  let lastHeight = 0;

  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = true;
  scene.add(group);

  return {
    render(
      ctx: CanvasRenderingContext2D,
      source: HTMLCanvasElement,
      prism: PrismFrame,
      options: FacetedPrismRenderOptions,
    ) {
      if (!source.width || !source.height || !prism.renderActive || prism.points.length < 3 || prism.decay <= 0) return;

      const width = ctx.canvas.width;
      const height = ctx.canvas.height;
      if (width !== lastWidth || height !== lastHeight) {
        lastWidth = width;
        lastHeight = height;
        renderer.setSize(width, height, false);
        camera.left = -width * 0.5;
        camera.right = width * 0.5;
        camera.top = height * 0.5;
        camera.bottom = -height * 0.5;
        camera.updateProjectionMatrix();
      }

      clearGroup(group);

      const depth = prism.depth * (options.quality.level === 'boost' ? 0.72 : 1);
      const faceAlpha = clamp(prism.decay * 0.96, 0, 1);
      const frontPoints = prism.points.map((point) => toLocalPoint(point, prism.center, prism.rotation.roll, depth, source));
      const backPoints = frontPoints.map((point) => ({ ...point, z: point.z - depth }));
      const faceOptions = {
        alpha: faceAlpha,
        intensity: options.intensity,
        motion: clamp(prism.motion / 48, 0, 1),
        timeMs: options.timeMs,
        quality: options.quality,
      };

      edgeMaterial.opacity = options.quality.simplifyDebug ? faceAlpha * 0.1 : faceAlpha * 0.18;
      group.position.set(prism.center.x - width * 0.5, height * 0.5 - prism.center.y, 0);
      group.rotation.set(prism.rotation.pitch, prism.rotation.yaw, -prism.rotation.roll);

      addFaceMesh(group, frontPoints, source, getFaceEffect(options.faceEffectIds, 0), faceOptions, false);
      addFaceMesh(group, [...backPoints].reverse(), source, getFaceEffect(options.faceEffectIds, 1), faceOptions, false);

      for (let index = 0; index < frontPoints.length; index += 1) {
        const next = (index + 1) % frontPoints.length;
        const side = [frontPoints[index], frontPoints[next], backPoints[next], backPoints[index]];
        addQuadMesh(group, side, source, getFaceEffect(options.faceEffectIds, index + 2), faceOptions);
      }

      const overlapEffectId = options.overlapEffectId;
      if (overlapEffectId) {
        prism.overlapRegions.forEach((region) => {
          const overlapPoints = region.map((point) => toLocalPoint(point, prism.center, prism.rotation.roll, depth + 8, source));
          addFaceMesh(group, overlapPoints, source, overlapEffectId, {
            ...faceOptions,
            alpha: clamp(prism.decay * 0.98, 0, 1),
            intensity: options.intensity + 0.12,
          }, true);
        });
      }

      renderer.render(scene, camera);

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(renderer.domElement, 0, 0, width, height);
      ctx.restore();
    },
    dispose() {
      clearGroup(group);
      edgeMaterial.dispose();
      renderer.dispose();
    },
  };

  function addFaceMesh(
    target: THREE.Group,
    points: LocalPoint[],
    source: HTMLCanvasElement,
    effectId: SurfaceEffectId,
    options: Parameters<typeof renderSurfaceEffectCanvas>[2],
    lift: boolean,
  ) {
    if (points.length < 3) return;

    const geometry = createPolygonGeometry(points, lift);
    const material = createSurfaceMaterial(source, effectId, options);
    const mesh = new THREE.Mesh(geometry, material);
    target.add(mesh);
    addEdges(target, geometry);
  }

  function addQuadMesh(
    target: THREE.Group,
    points: LocalPoint[],
    source: HTMLCanvasElement,
    effectId: SurfaceEffectId,
    options: Parameters<typeof renderSurfaceEffectCanvas>[2],
  ) {
    const geometry = createQuadGeometry(points);
    const material = createSurfaceMaterial(source, effectId, options);
    const mesh = new THREE.Mesh(geometry, material);
    target.add(mesh);
    addEdges(target, geometry);
  }

  function createSurfaceMaterial(
    source: HTMLCanvasElement,
    effectId: SurfaceEffectId,
    options: Parameters<typeof renderSurfaceEffectCanvas>[2],
  ) {
    const canvas = renderSurfaceEffectCanvas(source, effectId, options);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;

    return new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: options.alpha,
      side: THREE.DoubleSide,
      depthWrite: true,
    });
  }

  function addEdges(target: THREE.Group, geometry: THREE.BufferGeometry) {
    const edges = new THREE.EdgesGeometry(geometry, 28);
    const lines = new THREE.LineSegments(edges, edgeMaterial.clone());
    target.add(lines);
  }
}

function toLocalPoint(point: Point, center: Point, roll: number, depth: number, source: HTMLCanvasElement): LocalPoint {
  const x = point.x - center.x;
  const y = -(point.y - center.y);
  const cos = Math.cos(roll);
  const sin = Math.sin(roll);
  const z = ((point.z ?? 0) - (center.z ?? 0)) * 900 + depth * 0.5;

  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
    z: clamp(z, -depth * 0.15, depth * 1.15),
    u: clamp(point.x / Math.max(1, source.width), 0, 1),
    v: clamp(point.y / Math.max(1, source.height), 0, 1),
  };
}

function createPolygonGeometry(points: LocalPoint[], lift: boolean) {
  const center = polygonCenter(points);
  const vertices: number[] = [center.x, center.y, (center.z ?? 0) + (lift ? 1.5 : 0)];
  const uvs: number[] = [average(points.map((point) => point.u)), average(points.map((point) => point.v))];
  const indices: number[] = [];

  points.forEach((point) => {
    vertices.push(point.x, point.y, point.z + (lift ? 1.5 : 0));
    uvs.push(point.u, point.v);
  });

  for (let index = 1; index <= points.length; index += 1) {
    const next = index === points.length ? 1 : index + 1;
    indices.push(0, index, next);
  }

  return makeGeometry(vertices, uvs, indices);
}

function createQuadGeometry(points: LocalPoint[]) {
  const vertices = points.flatMap((point) => [point.x, point.y, point.z]);
  const uvs = points.flatMap((point) => [point.u, point.v]);
  return makeGeometry(vertices, uvs, [0, 1, 2, 0, 2, 3]);
}

function makeGeometry(vertices: number[], uvs: number[], indices: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function clearGroup(group: THREE.Group) {
  [...group.children].forEach((child) => {
    group.remove(child);
    disposeObject(child);
  });
}

function disposeObject(object: THREE.Object3D) {
  const mesh = object as THREE.Mesh;
  const line = object as THREE.LineSegments;
  const geometry = mesh.geometry ?? line.geometry;
  const material = mesh.material ?? line.material;

  geometry?.dispose();

  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
  } else if (material) {
    disposeMaterial(material);
  }
}

function disposeMaterial(material: THREE.Material) {
  const maybeMapped = material as THREE.Material & { map?: THREE.Texture };
  maybeMapped.map?.dispose();
  material.dispose();
}

function getFaceEffect(faceEffectIds: PresetId[], index: number): PresetId {
  return faceEffectIds[index % Math.max(1, faceEffectIds.length)] ?? 'thermal-vision';
}

function average(values: number[]) {
  if (!values.length) return 0.5;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
