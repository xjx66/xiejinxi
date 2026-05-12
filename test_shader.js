const THREE = require('three');
const mat = new THREE.MeshStandardMaterial();
const gl = require('gl')(1,1);
// Not easy to get shader without a renderer. Let's just grep the three source code in node_modules if it exists.
