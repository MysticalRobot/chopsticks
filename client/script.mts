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

type Selection = {
	hand: Hand | null;
	originalHandPosition: [number, number, number] | null;
	pointerPressed: boolean;
}
type Fingers = 0 | 1 | 2 | 3 | 4 | 5;
class Hand {
	belongsToP1: boolean;
	object: THREE.Object3D;
	material: THREE.MeshLambertMaterial;
	mixer: THREE.AnimationMixer
	hitBox: THREE.Box3;
	hitBoxHelper: THREE.Mesh;
	fingers: Fingers;
	constructor(scene: THREE.Scene, belongsToP1: boolean, model: THREE.Object3D, position: [number, number, number], 
		color: number, y_rotation: number, x_scale: number) {
		this.belongsToP1 = belongsToP1;
		this.object = clone(model); // deep copy
		this.material = new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 1 });

		this.mixer = new THREE.AnimationMixer(this.object);
		// const a = this.mixer.clipAction()

		this.object.position.set(...position);

		this.hitBoxHelper = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 1.5));
		this.hitBoxHelper.position.set(...position);
		this.hitBoxHelper.visible = false;
		scene.add(this.hitBoxHelper);
		this.hitBox = new THREE.Box3();
		this.hitBox.setFromObject(this.hitBoxHelper);

		this.object.traverse((child: THREE.Object3D) => {
			if (child instanceof THREE.Mesh) {
				child.material = this.material;
			}
		});
		this.object.rotateY(y_rotation);
		this.object.scale.x *= x_scale;

		this.fingers = 5;
		scene.add(this.object);
	}
}

interface Ruleset {
	isValidMove(hand1: Hand, hand2: Hand, fingers?: number): boolean;
	isGameOver(hands: [Hand, Hand, Hand, Hand]): boolean;
}
class OriginalRuleset implements Ruleset {
	isValidMove(hand1: Hand, hand2: Hand, fingers?: number): boolean {
		return true;
		// division or transfer
		if (hand1.belongsToP1 === hand2.belongsToP1) {

		} else {
			// cannot attack dead hand
			if (hand2.fingers === 0) {
				return false;
			}
		}
	}
	updateFingers(hand1: Hand, hand2: Hand, fingers?: number): void {
	}
	isGameOver(hands: [Hand, Hand, Hand, Hand]): boolean {
		// game is over when either player has 0 fingers up in total
		return hands[0].fingers + hands[1].fingers === 0 || 
			hands[2].fingers + hands[3].fingers === 0;
	}
}
class Game {
	hands: [Hand, Hand, Hand, Hand];
	ruleset: Ruleset;
	isP1Turn: boolean;
	constructor(hands: [Hand, Hand, Hand, Hand], ruleset: Ruleset, isP1Turn: boolean) {
		this.hands = hands;
		this.ruleset = ruleset;
		this.isP1Turn = isP1Turn;
	}
	makeMove(hand1: Hand, hand2: Hand): void {
		this.isP1Turn = !this.isP1Turn;
	}

}

function clamp(low: number, val: number, high: number) {
	return Math.min(Math.max(val, low), high);
}
function computePointerIntersections(canvas: HTMLCanvasElement, event: PointerEvent, pointer: THREE.Vector2, 
	raycaster: THREE.Raycaster, camera: THREE.PerspectiveCamera, objects: Array<THREE.Object3D>): Array<THREE.Intersection> {
	const rect = canvas.getBoundingClientRect();
	pointer.x = ((clamp(rect.left, event.clientX, rect.right) - rect.left) / rect.width) * 2 - 1;
	pointer.y = -((clamp(rect.top, event.clientY, rect.bottom) - rect.top) / rect.height) * 2 + 1;
	// update the picking ray with the camera and pointer position
	raycaster.setFromCamera(pointer, camera);
	// calculate objects intersecting the picking ray
	return raycaster.intersectObjects(objects);
}
function createUpdateHandsClosure(canvas: HTMLCanvasElement, pointer: THREE.Vector2, raycaster: THREE.Raycaster, 
	camera: THREE.PerspectiveCamera, scene: THREE.Scene, selection: Selection, plane: THREE.Mesh, outlinePass: OutlinePass,
	hands: [Hand, Hand, Hand, Hand]) : (event: PointerEvent) => void {
	return function updateHands(event: PointerEvent): void {
		const intersections = computePointerIntersections(canvas, event, pointer, raycaster, camera, scene.children);
		// the cursor should only be grab when the ray intersects a hand
		if (intersections.length > 2) {
			canvas.style.cursor = 'grab';
		} else {
			canvas.style.cursor = 'auto';
		}
		if (selection.hand !== null && selection.pointerPressed) {
			const hitBox = selection.hand.hitBox;
			hitBox.setFromObject(selection.hand.hitBoxHelper);
			outlinePass.selectedObjects = hands
				.filter((hand) => { return hitBox.intersectsBox(hand.hitBox); })
				.map((hand) => { return hand.object; });
			// the ray will always intersect with the plane 
			const planeIntersection = intersections.find((int) => { return int.object === plane });
			if (planeIntersection === undefined) {
				return;
			}
			const pointOfPlaneIntersection = planeIntersection.point;
			selection.hand.object.position.set(pointOfPlaneIntersection.x, selection.hand.object.position.y, pointOfPlaneIntersection.z);
			selection.hand.hitBoxHelper.position.set(pointOfPlaneIntersection.x, selection.hand.object.position.y, pointOfPlaneIntersection.z);
		}
	}
}
function createSelectHandClosure(canvas: HTMLCanvasElement, pointer: THREE.Vector2, raycaster: THREE.Raycaster, 
	camera: THREE.PerspectiveCamera, hands: [Hand, Hand, Hand, Hand], selection: Selection): (event: PointerEvent) => void {
	return function selectHand(event: PointerEvent): void {
		const intersections = computePointerIntersections(canvas, event, pointer, raycaster, camera, hands.map((hand) => { return hand.object; }));
		if (intersections.length === 0) {
			return;
		}
		// at this point, a hand must have been clicked on
		const newHandSelectionGrandChild = intersections[0].object;
		if (newHandSelectionGrandChild === null) {
			return;
		}
		const newHandSelectionChild = newHandSelectionGrandChild.parent;
		if (newHandSelectionChild === null) {
			return;
		}
		const newHandSelection = newHandSelectionChild.parent;
		if (newHandSelection === null) {
			return;
		}
		if (selection.hand !== null && selection.originalHandPosition !== null) {
			selection.hand.object.position.set(...selection.originalHandPosition);
		}
		// hands should contain the newly selected hand
		const newHandSelectionObject = hands.find((hand) => { return hand.object === newHandSelection; });
		if (newHandSelectionObject === undefined) {
			return;
		}
		selection.hand = newHandSelectionObject;
		selection.originalHandPosition = [...newHandSelection.position.toArray()];
		selection.pointerPressed= true;
	}
}
function createResetHandClosure(game: Game, selection: Selection, outlinePass: OutlinePass): () => void {
	return function resetHand(): void {
		if (selection.hand === null || selection.originalHandPosition === null) {
			return 
		}
		// find the hand whose hitbox intersects with the selected hand's hitbox
		const hitBox = selection.hand.hitBox;
		hitBox.setFromObject(selection.hand.hitBoxHelper);
		const hand2 = game.hands.find((hand) => { return selection.hand !== hand && hitBox.intersectsBox(hand.hitBox); });
		if (selection.hand.belongsToP1 === game.isP1Turn && hand2 !== undefined) {
			if (game.ruleset.isValidMove(selection.hand, hand2)) {
				window.alert('made move');
			} else {
				window.alert('invalid move');
			}
		}
		selection.hand.object.position.set(...selection.originalHandPosition);
		selection.hand.hitBoxHelper.position.set(...selection.originalHandPosition);
		selection.hand.hitBox.setFromObject(selection.hand.hitBoxHelper);

		selection.hand = null;
		selection.originalHandPosition = null;
		selection.pointerPressed = false;
		outlinePass.selectedObjects = [];
	}
}
// this eliminates blurriness by ensuring that there is a px rendered for every px on the canvas
function resizeRendererToDisplaySize(renderer: THREE.WebGLRenderer, canvas: HTMLCanvasElement, 
	composer: EffectComposer, effectFXAA: ShaderPass): boolean {
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
function createRenderClosure(renderer: THREE.WebGLRenderer, composer: EffectComposer, 
	effectFXAA: ShaderPass, canvas: HTMLCanvasElement, camera: THREE.PerspectiveCamera, 
	clock: THREE.Clock, game: Game): () => void {
	return function render(): void {
		if (resizeRendererToDisplaySize(renderer, canvas, composer, effectFXAA)) {
			camera.aspect = canvas.clientWidth / canvas.clientHeight;
			camera.updateProjectionMatrix();
		}
		// update animations and render
		const delta = clock.getDelta();
		game.hands.forEach((hand) => { hand.mixer.update(delta); });
		composer.render();
		if (!game.ruleset.isGameOver(game.hands)) {
			window.requestAnimationFrame(render);
		}
	}
}

const grey = 0x9e9e9e;
const white = 0x9e9e9e;
const black = 0x4a4a4a;

function init() {
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

	const light = new THREE.DirectionalLight(white, 3);
	light.position.set(0, 10, 0);
	light.lookAt(0, 0, 0);
	scene.add(light);

	const canvas: HTMLCanvasElement | null = document.querySelector('#c');
	const divisionAndTransferMenu: HTMLDivElement | null = document.querySelector('#divisionAndTransferMenu');
	const numFingersOptions: HTMLDivElement | null = document.querySelector('#numFingersOptions');
	const clock = new THREE.Clock();
	if (canvas === null) {
		throw new Error('null canvas');
	} else if (divisionAndTransferMenu === null) {
		throw new Error('null division and transfer menu');
	} else if (numFingersOptions === null) {
		throw new Error('null finger options');
	}
	numFingersOptions.addEventListener('pointerup', (event: PointerEvent) => {
		divisionAndTransferMenu.style.visibility = 'hidden';
		console.log(event.target);
	});

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
	outlinePass.visibleEdgeColor.set(white);
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
	const selection: Selection = { hand: null, originalHandPosition: null, pointerPressed: false };

	let animations: Array<THREE.AnimationClip>;
	let game: Game;
	let intervalID: number;
	new GLTFLoader().load(
		'./hand.glb',
		(gltf) => {
			window.clearInterval(intervalID);
			animations = gltf.animations;
			const hands : [Hand, Hand, Hand, Hand] = [
				new Hand(scene, true, gltf.scene, [-1, 0, 1.5], grey, Math.PI, -1),
				new Hand(scene, true, gltf.scene, [1, 0, 1.5], grey, Math.PI, 1),
				new Hand(scene, false, gltf.scene, [1, 0, -1.5], black, 0, -1),
				new Hand(scene, false, gltf.scene, [-1, 0, -1.5], black, 0, 1)
			];
			game = new Game(hands, new OriginalRuleset(), true);
			window.addEventListener('pointermove', createUpdateHandsClosure(canvas, pointer, raycaster, camera, scene, selection, plane, outlinePass, game.hands));
			canvas.addEventListener('pointerdown', createSelectHandClosure(canvas, pointer, raycaster, camera, hands, selection));
			canvas.addEventListener('pointerup', createResetHandClosure(game, selection, outlinePass));

			window.requestAnimationFrame(createRenderClosure(renderer, composer, effectFXAA, canvas, camera, clock, game));
		},
		// potential progress bar :O (ts loads very quickly though)
		(event: ProgressEvent) => { 
			intervalID = window.setInterval(() => { 
				if (event.lengthComputable) {
					// console.log('loaded', event.loaded / event.total); 
				}
			}, 0, []);
		},
		(error): void => { console.error(error); }
	);
}

init();
