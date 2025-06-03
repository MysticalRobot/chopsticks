'use strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

// hand setup
const scene = new THREE.Scene();
const white = 0x9e9e9e;
const black = 0x4a4a4a;
let model: THREE.Object3D;
let animations: Array<THREE.AnimationClip>;
const mixers: Array<THREE.AnimationMixer> = [];
const hands: Array<THREE.Object3D> = [];
function createHand(name: string, position: Array<number>, color: number, y_rotation: number, x_scale: number) {
	const dupe = clone(model); // deep copy
	dupe.name = name;
	dupe.position.set(...position);
	dupe.rotateY(y_rotation);
	dupe.scale.x *= x_scale;
	dupe.traverse((child: THREE.Object3D) => {
		if (child instanceof THREE.Mesh) {
			child.material = new THREE.MeshLambertMaterial({ color });
		}
	});
	scene.add(dupe);
	mixers.push(new THREE.AnimationMixer(dupe));
	hands.push(dupe);
}
function createHands() {
	createHand('l1', [-1, 0, 1.5], white, Math.PI, -1);
	createHand('r1', [1, 0, 1.5], white, Math.PI, 1);
	createHand('l2', [1, 0, -1.5], black, 0, -1);
	createHand('r2', [-1, 0, -1.5], black, 0, 1);
}
new GLTFLoader().load(
	'./hand.glb',
	(gltf): void => {
		model = gltf.scene;
		animations = gltf.animations;
		createHands();
	},
	undefined,
	(error): void => { console.error(error); }
);

// camera, lighting, and rendering
const camera = new THREE.PerspectiveCamera(75, 300 / 150, 0.1, 20); // 300 by 150 is the default canvas size
camera.position.set(0, 3, 0);
camera.lookAt(0, 0, 0);

const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(0, 10, 0);
light.lookAt(0, 0, 0);
scene.add(light);

const canvas: HTMLCanvasElement | null = document.querySelector('#c');
const clock = new THREE.Clock();
if (canvas === null) {
	throw new Error('null canvas');
}

// no need for natural AA with FXAA
const renderer = new THREE.WebGLRenderer({ antialias: false, canvas });

// whole lotta post-processing
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// helps with outlining selected hands
const outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera);
outlinePass.edgeStrength = 3.0;
outlinePass.edgeThickness = 1.0;
outlinePass.visibleEdgeColor.set(0xffffff);
composer.addPass(outlinePass);

// resolves lighting issues caused by outlining
const outputPass = new OutputPass();
composer.addPass(outputPass);

// antialiasing
const effectFXAA = new ShaderPass(FXAAShader);
effectFXAA.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
composer.addPass(effectFXAA);

// hand click event handling 
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let selectedHands: Array<THREE.Object3D> = [];
function updateHands(event) {
	const rect = renderer.domElement.getBoundingClientRect();
	mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	mouse.y = - ((event.clientY - rect.top) / rect.height) * 2 + 1;
	// update the picking ray with the camera and mouse position
	raycaster.setFromCamera(mouse, camera);
	// calculate objects intersecting the picking ray
	const intersections = raycaster.intersectObjects(scene.children);
	if (intersections.length === 0) {
		return;
	}
	const name = intersections[0].object!.parent!.parent!.name; // cooked
	// toggle hand selection
	const oldLength = selectedHands.length;
	selectedHands = selectedHands.filter((hand) => { return hand.name != name; });
	if (oldLength === selectedHands.length) {
		const hand = hands.find((hand) => { return hand.name === name; });
		if (hand === undefined) {
			return;
		}
		selectedHands.push(hand);
	}
	outlinePass.selectedObjects = selectedHands;
}
canvas.addEventListener('click', updateHands);

// this eliminates blurriness by ensuring that there is a px rendered for every px on the canvas
function resizeRendererToDisplaySize(canvas: HTMLCanvasElement): boolean {
	// deals with varying pixel ratios (HD-DPI displays)
	const pixelRatio = window.devicePixelRatio;
	renderer.setPixelRatio(pixelRatio);
	const width = Math.floor(canvas.clientWidth * pixelRatio);
	const height = Math.floor(canvas.clientHeight * pixelRatio);
	const needResize = canvas.width !== width || canvas.height !== height;
	if (needResize) {
		renderer.setSize(width, height, false); // false to not allow renderer to set the canvas' size
		composer.setSize(width, height);
		effectFXAA.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
	}
	return needResize;
}
function render(): void {
	const canvas = renderer.domElement;
	if (resizeRendererToDisplaySize(canvas)) {
		camera.aspect = canvas.clientWidth / canvas.clientHeight;
		camera.updateProjectionMatrix();
	}
	// update animations and render
	const delta = clock.getDelta();
	mixers.forEach((mixer) => { mixer.update(delta); });
	// renderer.render(scene, camera);
	composer.render();
	window.requestAnimationFrame(render);
}
window.requestAnimationFrame(render);
