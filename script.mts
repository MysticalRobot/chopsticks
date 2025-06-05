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

enum Fingers { One = 1, Two, Three, Four, Five }
class Hand {
	object: THREE.Object3D;
	material: THREE.MeshLambertMaterial;
	mixer: THREE.AnimationMixer
	fingers: Fingers;
	constructor(scene: THREE.Scene, model: THREE.Object3D, position: Array<number>, color: number, y_rotation: number, x_scale: number) {
		// this method is called after the model has loaded
		this.object = clone(model); // deep copy
		this.material = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 1 });
		this.mixer = new THREE.AnimationMixer(this.object);
		this.object.position.set(...position);
		this.object.traverse((child: THREE.Object3D) => {
			if (child instanceof THREE.Mesh) {
				child.material = this.material;
			}
		});
		this.object.rotateY(y_rotation);
		this.object.scale.x *= x_scale;
		scene.add(this.object);
	}
}

interface Ruleset {
	isValidMove(p1Hand: Hand, p2Hand: Hand): boolean;
	isGameOver(hands: [Hand, Hand, Hand, Hand]): boolean;
}
class Game {
	hands: [Hand, Hand, Hand, Hand];
	ruleset: Ruleset | undefined;
	constructor(hands: [Hand, Hand, Hand, Hand], ruleset?: Ruleset) {
		this.hands = hands;
		this.ruleset = ruleset;
	}
	makeMove(p1Hand: Hand, p2Hand: Hand): void {
	}
}

function clamp(low: number, val: number, high: number) {
	return Math.min(Math.max(val, low), high);
}
function computePointerIntersections(event: PointerEvent, objects: Array<THREE.Object3D>): Array<THREE.Intersection> {
	const rect = renderer.domElement.getBoundingClientRect();
	pointer.x = ((clamp(rect.left, event.clientX, rect.right) - rect.left) / rect.width) * 2 - 1;
	pointer.y = -((clamp(rect.top, event.clientY, rect.bottom) - rect.top) / rect.height) * 2 + 1;
	// update the picking ray with the camera and pointer position
	raycaster.setFromCamera(pointer, camera);
	// calculate objects intersecting the picking ray
	return raycaster.intersectObjects(objects);
}
function createUpdateHandsClosure(canvas: HTMLCanvasElement) {
	return function updateHands(event: PointerEvent): void {
		const intersections = computePointerIntersections(event, scene.children);
		if (intersections.length !== 1) {
			canvas.style.cursor = 'grab';
		} else {
			canvas.style.cursor = 'auto';
		}
		if (selectedHand !== null && pressed) {
			// the ray will always intersect with the plane
			const planeIntersection = intersections.find((int) => { return int.object === plane })!.point;
			selectedHand.position.set(planeIntersection.x, selectedHand.position.y, planeIntersection.z);
		}
	}
}
function createSelectHandClosure(outlinePass: OutlinePass): (event: PointerEvent) => void {
	return function selectHand(event: PointerEvent): void {
		const intersections = computePointerIntersections(event, hands.map((hand) => { return hand.object; }));
		if (intersections.length === 0) {
			return;
		}
		// at this point, a hand must have been clicked on
		const newSelectedHand = intersections[0].object.parent!.parent!;
		if (selectedHand !== null && selectedHand != newSelectedHand) {
			// originalPosition is set/unset whenever selectedHand is
			selectedHand.position.set(...originalPosition);
		}
		originalPosition = new THREE.Vector3(...newSelectedHand.position);
		selectedHand = newSelectedHand;
		outlinePass.selectedObjects = [selectedHand];
		pressed = true;
	}
}
function createResetHandClosure(outlinePass: OutlinePass): (event: PointerEvent) => void {
	return function resetHand(): void {
		// reset position and clear selection
		if (selectedHand !== null) {
			// originalPosition is set/unset whenever selectedHand is
			selectedHand.position.set(...originalPosition);
		}
		selectedHand = null;
		originalPosition = null;
		outlinePass.selectedObjects = [];
		pressed = false;
	}
}
// this eliminates blurriness by ensuring that there is a px rendered for every px on the canvas
function resizeRendererToDisplaySize(renderer: THREE.WebGLRenderer, composer: EffectComposer, effectFXAA: ShaderPass, canvas: HTMLCanvasElement): boolean {
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
function createRenderClosure(renderer: THREE.WebGLRenderer, composer: EffectComposer, effectFXAA: ShaderPass, hands: [Hand, Hand, Hand, Hand]): () => void {
	return function render(): void {
		const canvas = renderer.domElement;
		if (resizeRendererToDisplaySize(renderer, composer, effectFXAA, canvas)) {
			camera.aspect = canvas.clientWidth / canvas.clientHeight;
			camera.updateProjectionMatrix();
		}
		// update animations and render
		const delta = clock.getDelta();
		hands.forEach((hand) => { hand.mixer.update(delta); });
		composer.render();
		window.requestAnimationFrame(render);
	}
}

const white = 0x9e9e9e;
const black = 0x4a4a4a;

// scene setup
const scene = new THREE.Scene();
const plane = new THREE.Mesh(new THREE.PlaneGeometry(20, 20));
plane.visible = false;
plane.rotation.x = -Math.PI / 2;
plane.position.set(0, 0, 0);
scene.add(plane);

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
let selectedHand: THREE.Object3D | null = null;
let originalPosition: THREE.Vector3 | null = null;
let pressed = false;
window.addEventListener('pointermove', createUpdateHandsClosure(canvas));
canvas.addEventListener('pointerdown', createSelectHandClosure(outlinePass));
window.addEventListener('pointerup', createResetHandClosure(outlinePass));

let animations: Array<THREE.AnimationClip>;
let hands: [Hand, Hand, Hand, Hand];
new GLTFLoader().load(
	'./hand.glb',
	(gltf): void => {
		animations = gltf.animations;
		hands = [
			new Hand(scene, gltf.scene, [-1, 0, 1.5], white, Math.PI, -1),
			new Hand(scene, gltf.scene, [1, 0, 1.5], white, Math.PI, 1),
			new Hand(scene, gltf.scene, [1, 0, -1.5], black, 0, -1),
			new Hand(scene, gltf.scene, [-1, 0, -1.5], black, 0, 1)
		]
		window.requestAnimationFrame(createRenderClosure(renderer, composer, effectFXAA, hands));
	},
	undefined,
	(error): void => { console.error(error); }
);
