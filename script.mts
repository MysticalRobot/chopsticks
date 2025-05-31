"use strict";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
const scene = new THREE.Scene();
const loader = new GLTFLoader();
const positions = [
	[-1, 0, 1.5],
	[1, 0, 1.5],
	[1, 0, -1.5],
	[-1, 0, -1.5],
];
let model: THREE.Object3D;
const white = new THREE.MeshLambertMaterial({ color: 0x9e9e9e });
const black = new THREE.MeshLambertMaterial({ color: 0x4a4a4a });
function createHands() {
	positions.forEach((position, i) => {
		const dupe = clone(model);
		dupe.position.set(...position);
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
	});
}
const hands: THREE.Object3D[] = [];
loader.load(
	"./hand.glb",
	(gltf): void => { model = gltf.scene; createHands(); },
	undefined,
	(error): void => { console.error(error); }
);
/*
- 300 by 150 is the default canvas size
- four properties define a frustum, or the 3d shape that
  represents what the camera sees
- the near is where it starts, and the far is where
  it is cut off
- the fov is the height of the shape
*/
// fov, aspect, near, far
const camera = new THREE.PerspectiveCamera(75, 300 / 150, 0.1, 20);
// does not have to be a part of the scene
camera.position.set(0, 3, 0);
camera.lookAt(0, 0, 0);

// color, intensity
const light = new THREE.DirectionalLight(0xffffff, 3);

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
function resizeRendererToDisplaySize(renderer: THREE.Renderer, canvas: HTMLCanvasElement): boolean {
	// deals with varying pixel ratios (HD-DPI displays)
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
function render(): void {
	const canvas = renderer.domElement;
	if (resizeRendererToDisplaySize(renderer, canvas)) {
		// this fixed the issue of the cubes getting distorted
		// due to the browser window size & the camera's aspect
		camera.aspect = canvas.clientWidth / canvas.clientHeight;
		camera.updateProjectionMatrix();
	}
	renderer.render(scene, camera);
	// over and over again
	requestAnimationFrame(render);
}
requestAnimationFrame(render);
