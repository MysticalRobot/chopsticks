'use strict';
import * as THREE from 'three';
import {GLTF, GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
// import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
class NullCanvasError extends Error {
  constructor(message: string) {
    super(message);
  }
}
const canvas : HTMLCanvasElement | null = document.querySelector('#c');
if (canvas === null) {
  throw new NullCanvasError(`could not select canvas from document`);
}
const scene : THREE.Scene = new THREE.Scene();
const loader : GLTFLoader = new GLTFLoader();
const url : string = './model.gltf';
function dumpObject(obj : THREE.Object3D, lines : string[] = [], isLast : boolean = true, prefix : string = '') : string[] {
  const localPrefix : string = isLast ? '└─' : '├─';
  lines.push(`${prefix}${prefix ? localPrefix : ''}${obj.name || '*no-name*'} [${obj.type}]`);
  const newPrefix : string = prefix + (isLast ? '  ' : '│ ');
  const lastNdx : number = obj.children.length - 1;
  obj.children.forEach((child : THREE.Object3D, ndx : number) : void => {
    const isLast : boolean = ndx === lastNdx;
    dumpObject(child, lines, isLast, newPrefix);
  });
  return lines;
}
const positions = [
  [-1, 0, 2.25],
  [1, 0, 2.25],
  [1, 0, -2.25],
  [-1, 0, -2.25],
]
loader.load(
  url, 
  (gltf : GLTF) : void => {
    const model : THREE.Object3D = gltf.scene.children[0].children[0];
    console.log('model loaded');
    console.log(dumpObject(model).join('\n'));
    model.scale.setScalar(0.25);
    for (let i = 0; i != 4; ++i) {
      const dupe : THREE.Object3D = clone(model);
      dupe.position.x = positions[i][0];
      dupe.position.y = positions[i][1];
      dupe.position.z = positions[i][2]; 
      dupe.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const color = i >= 2 ? 0x4a4a4a : 0x9e9e9e;
          console.log(child.material);
          child.material = new THREE.MeshLambertMaterial({ color });
        }
      });
      if (i >= 2) {
        dupe.rotateX(Math.PI / -3);
      } else {
        dupe.rotateX(Math.PI / 3);
        dupe.rotateY(Math.PI);
      }
      if ((i & 1) == 0) {
        dupe.scale.x *= -1;
      }
      scene.add(dupe);
    }
    
  },
  undefined,
  (error : unknown) : void => {
    console.error(error);
  }
);
/*
- 300 by 150 is the default canvas size
- four properties define a frustum, or the 3d shape that
  represents what the camera sees
- the near is where it starts, and the far is where 
  it is cut off
- the fov is the height of the shape
*/
const cameraProperties : { fov: number, aspect: number, near: number, far: number } = { fov: 75, aspect: 300/150, near: 0.1, far: 20 };
const camera : THREE.PerspectiveCamera = new THREE.PerspectiveCamera(
  cameraProperties.fov, cameraProperties.aspect, 
  cameraProperties.near, cameraProperties.far
);
// does not have to be a part of the scene
camera.position.set(0, 5, 0);
camera.lookAt(0, 0, 0);
// camera.rotateZ(Math.PI);
const lightProperties : { color: number, intensity: number } = { color: 0xFFFFFF, intensity: 3 };
const light : THREE.DirectionalLight = new THREE.DirectionalLight(
  lightProperties.color, lightProperties.intensity
);
// lights also have a target (currently at (0, 0, 0))
light.position.set(0, 10, 5);
light.lookAt(0, 0, 0);
scene.add(light);
// shi renders the shi
const renderer : THREE.WebGLRenderer = new THREE.WebGLRenderer({ antialias: true, canvas });
// this makes sure that there is a px rendered for 
// every px on the canvas, thus eliminating blurryness
function resizeRendererToDisplaySize(renderer : THREE.Renderer) : boolean {
  // deals with varying pixel ratios (HD-DPI displays)
  const canvas : HTMLCanvasElement = renderer.domElement;
  const pixelRatio : number = window.devicePixelRatio;
  const width : number = Math.floor( canvas.clientWidth  * pixelRatio );
  const height : number = Math.floor( canvas.clientHeight * pixelRatio );
  const needResize : boolean = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    // false to not allow renderer to set the canvas' size
    renderer.setSize(width, height, false);
  }
  return needResize;
}
// function render(time : number) : void {
function render() : void {
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
try {
  requestAnimationFrame(render);
} catch (error : unknown) {
  if (error instanceof NullCanvasError) {
    throw new NullCanvasError(error.message);
  }
  throw new Error(`idk what went wrong`);
}