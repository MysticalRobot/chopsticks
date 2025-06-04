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

// scene setup
const scene = new THREE.Scene();
const plane = new THREE.Mesh(new THREE.PlaneGeometry(20, 20));
plane.visible = false;
plane.rotation.x = -Math.PI / 2;
plane.position.set(0, 0, 0);
scene.add(plane);
const white = 0x9e9e9e;
const black = 0x4a4a4a;
let model: THREE.Object3D | undefined = undefined;
let animations: Array<THREE.AnimationClip> | undefined = undefined;
const mixers: Array<THREE.AnimationMixer> = [];
const hands: Array<THREE.Object3D> = [];
const materials: Array<THREE.MeshLambertMaterial> = [];
function createHand(name: string, position: Array<number>, color: number, y_rotation: number, x_scale: number) {
	// this method is called after the model has loaded
	const dupe = clone(model); // deep copy
	mixers.push(new THREE.AnimationMixer(dupe));
	hands.push(dupe);
	dupe.name = name;
	dupe.position.set(...position);
	dupe.rotateY(y_rotation);
	dupe.scale.x *= x_scale;
	dupe.traverse((child: THREE.Object3D) => {
		if (child instanceof THREE.Mesh) {
			materials.push(new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 1 }));
			child.material = materials[materials.length - 1];
		}
	});
	scene.add(dupe);
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
const pointer = new THREE.Vector2();
let selectedHand: THREE.Object3D | undefined = undefined;
let originalPosition: THREE.Vector3 | undefined = undefined;
let pressed = false;
function computePointerIntersections(event: PointerEvent, objects: Array<THREE.Object3D>) {
	const rect = renderer.domElement.getBoundingClientRect();
	pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
	// update the picking ray with the camera and pointer position
	raycaster.setFromCamera(pointer, camera);
	// calculate objects intersecting the picking ray
	return raycaster.intersectObjects(objects);
}
function updateHands(event: PointerEvent) {
	const intersections = computePointerIntersections(event, scene.children);
	if (intersections.length === 0) {
		return;
	}
	const names = intersections.map((int) => {
		if (int.object !== plane) {
			// at this point, a hand must have been clicked on
			return int.object.parent.parent.name;
		}
	});
	const selectedHands = hands.filter((hand) => { return names.includes(hand.name); });
	if (selectedHand !== undefined) {
		// the ray will always intersect with the plane
		const planeIntersection = intersections.find((int) => { return int.object === plane }).point;
		selectedHand.position.set(planeIntersection.x, selectedHand.position.y, planeIntersection.z);
		if (!selectedHands.includes(selectedHand)) {
			selectedHands.push(selectedHand);
		}
	}
	outlinePass.selectedObjects = selectedHands;
}
function selectHand(event: PointerEvent) {
	const intersections = computePointerIntersections(event, hands);
	if (intersections.length === 0) {
		return;
	}
	// at this point, a hand must have been clicked on
	const name = intersections[0].object.parent.parent.name;
	const newSelectedHand = hands.find((hand) => { return hand.name === name });
	if (selectedHand !== undefined && selectedHand != newSelectedHand) {
		// originalPosition is set/unset whenever selectedHand is
		selectedHand.position.set(...originalPosition);
	}
	originalPosition = newSelectedHand !== undefined ? new THREE.Vector3(...newSelectedHand.position) : undefined;
	selectedHand = newSelectedHand;
	pressed = true;
}
function deselectHand() {
	// reset position and clear selection
	if (selectedHand !== undefined) {
		// originalPosition is set/unset whenever selectedHand is
		selectedHand.position.set(...originalPosition);
	}
	originalPosition = undefined;
	selectedHand = undefined;
	pressed = false;
}
canvas.addEventListener('pointermove', updateHands);
canvas.addEventListener('pointerdown', selectHand);
canvas.addEventListener('pointerup', deselectHand);
canvas.addEventListener('pointerleave', deselectHand);

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
