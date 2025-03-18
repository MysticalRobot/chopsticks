"use strict";
import { Interface } from "readline";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
// if i ever need this...
// import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
interface Player {
  y: number;
}
class Game {
  p: Player;
  constructor(p: Player) {
    this.p = p;
  }
}
interface Rule {
  isValidMove(): boolean;
  gameOver(): boolean;
}
const scene = new THREE.Scene();
const loader = new GLTFLoader();
function dumpObject(
  obj: THREE.Object3D,
  lines: string[] = [],
  isLast: boolean = true,
  prefix: string = "",
): string[] {
  const localPrefix = isLast ? "└─" : "├─";
  lines.push(
    `${prefix}${prefix ? localPrefix : ""}${obj.name || "*no-name*"} [${obj.type}]`,
  );
  const newPrefix = prefix + (isLast ? "  " : "│ ");
  const lastNdx = obj.children.length - 1;
  obj.children.forEach((child, ndx): void => {
    const isLast = ndx === lastNdx;
    dumpObject(child, lines, isLast, newPrefix);
  });
  return lines;
}
const positions = [
  [-1, 0, 1.5],
  [1, 0, 1.5],
  [1, 0, -1.5],
  [-1, 0, -1.5],
];
const hands: THREE.Object3D[] = [];
loader.load(
  "./hand.glb",
  (gltf): void => {
    const white = new THREE.MeshLambertMaterial({ color: 0x9e9e9e });
    const black = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
    const model = gltf.scene;
    const animations = gltf.animations;
    model.traverse((child) => {
      if (child.animations) {
        animations.concat(child.animations);
      }
    });
    animations.forEach((clip: THREE.AnimationClip, index: number) => {
      console.log(`Animation ${index}: ${clip.name}`);
    });
    console.log("model loaded");
    console.log(dumpObject(model).join("\n"));
    for (let i = 0; i != 4; ++i) {
      const dupe = clone(model);
      dupe.position.x = positions[i][0];
      dupe.position.y = positions[i][1];
      dupe.position.z = positions[i][2];
      dupe.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          child.material = i >= 2 ? black : white;
        }
      });
      if (i < 2) {
        dupe.rotateY(Math.PI);
      }
      if ((i & 1) == 0) {
        dupe.scale.x *= -1;
      }
      scene.add(dupe);
      hands.push(dupe);
    }
  },
  undefined,
  (error): void => {
    console.error(error);
  },
);
/*
- 300 by 150 is the default canvas size
- four properties define a frustum, or the 3d shape that
  represents what the camera sees
- the near is where it starts, and the far is where
  it is cut off
- the fov is the height of the shape
*/
const cameraProperties = {
  fov: 75,
  aspect: 300 / 150,
  near: 0.1,
  far: 20,
};
const camera = new THREE.PerspectiveCamera(
  cameraProperties.fov,
  cameraProperties.aspect,
  cameraProperties.near,
  cameraProperties.far,
);
// does not have to be a part of the scene
camera.position.set(0, 3, 0);
camera.lookAt(0, 0, 0);
// camera.rotateZ(Math.PI);
const lightProperties = { color: 0xffffff, intensity: 3 };
const light = new THREE.DirectionalLight(
  lightProperties.color,
  lightProperties.intensity,
);
// lights also have a target (currently at (0, 0, 0))
light.position.set(0, 10, 0);
light.lookAt(0, 0, 0);
scene.add(light);
// shi renders the shi
const canvas: HTMLCanvasElement | null = document.querySelector("#c");
if (canvas == null) {
  throw new Error("null canvas");
}
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas });
// this makes sure that there is a px rendered for
// every px on the canvas, thus eliminating blurryness
function resizeRendererToDisplaySize(renderer: THREE.Renderer): boolean {
  // deals with varying pixel ratios (HD-DPI displays)
  const canvas = renderer.domElement;
  const pixelRatio = window.devicePixelRatio;
  const width = Math.floor(canvas.clientWidth * pixelRatio);
  const height = Math.floor(canvas.clientHeight * pixelRatio);
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    // false to not allow renderer to set the canvas' size
    renderer.setSize(width, height, false);
  }
  return needResize;
}
// function render(time : number) : void {
function render(): void {
  // time *= 0.001;  // convert time (milliseconds) to seconds
  if (resizeRendererToDisplaySize(renderer)) {
    // this fixed the issue of the cubes getting distorted
    // due to the browser window size & the camera's aspect
    const canvas = renderer.domElement;
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }
  renderer.render(scene, camera);
  // over and over again
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
