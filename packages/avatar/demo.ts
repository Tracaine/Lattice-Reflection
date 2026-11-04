import { VRMHumanoid } from "@pixiv/three-vrm";
import { Group, Mesh, MeshStandardMaterial, SphereGeometry } from "three";
import type { AvatarManifest, MouthShape } from "../contracts/avatar-speech";

export const demoManifest: AvatarManifest = {
  schemaVersion: 1, id: "10000000-0000-4000-8000-000000000061", name: "Pip",
  format: "builtin_demo", modelPath: null,
  sha256: "f9f829821256dfb5612a0f6b6b65bef7c91ea02edec04b1d408d440f597502a7",
  attribution: { authors: ["Open Companion contributors"], licenseName: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", sourceUrl: null },
  expressionMap: { sil: "sil", aa: "aa", ih: "ih", ou: "ou", ee: "ee", oh: "oh", blink: "blink", neutral: "neutral", happy: "happy", surprised: "surprised" },
  clips: [], camera: { framing: "waist_up", distanceScale: 1, targetHeightRatio: 0.72 },
  props: [], extras: { source: "original procedural rig, pip-v1", hashOf: "pip-v1" },
};

export const mouthShapes = ["sil", "aa", "ih", "ou", "ee", "oh"] as const;
const mouthTargets: Record<MouthShape, readonly [number, number]> = {
  sil: [.10, .016], aa: [.11, .075], ih: [.13, .035],
  ou: [.047, .058], ee: [.15, .027], oh: [.068, .072],
};

export function createDemoRig() {
  const root = new Group();
  const geometry = new SphereGeometry(1, 20, 14);
  const coat = new MeshStandardMaterial({ color: 0x426477, roughness: .8 });
  const face = new MeshStandardMaterial({ color: 0xe2b878, roughness: .8 });
  const ink = new MeshStandardMaterial({ color: 0x241b31, roughness: .7 });
  const gold = new MeshStandardMaterial({ color: 0xdeb647, roughness: .55 });
  const joint = (parent: Group, x: number, y: number, z = 0) => {
    const node = new Group();
    node.position.set(x, y, z);
    parent.add(node);
    return { node };
  };
  const part = (parent: Group, material: MeshStandardMaterial, scale: [number, number, number], x = 0, y = 0, z = 0) => {
    const mesh = new Mesh(geometry, material);
    mesh.scale.set(...scale);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const hips = joint(root, 0, .86);
  const spine = joint(hips.node, 0, .18);
  const head = joint(spine.node, 0, .5);
  part(hips.node, coat, [.25, .16, .15]);
  part(spine.node, coat, [.30, .31, .19], 0, .11);
  part(spine.node, gold, [.06, .06, .025], 0, .21, .19);
  part(head.node, face, [.27, .27, .22], 0, .15);
  part(head.node, gold, [.24, .12, .19], 0, .34, -.025);
  const eyes = [-.10, .10].map(x => part(head.node, ink, [.031, .045, .017], x, .185, .208));
  const mouth = part(head.node, ink, [.10, .016, .017], 0, .075, .211);
  const limb = (side: number) => {
    const upperArm = joint(spine.node, side * .28, .28);
    const lowerArm = joint(upperArm.node, side * .13, -.20);
    const hand = joint(lowerArm.node, side * .07, -.18);
    part(upperArm.node, coat, [.09, .15, .09], side * .065, -.10);
    part(lowerArm.node, coat, [.075, .125, .075], side * .035, -.09);
    part(hand.node, face, [.063, .071, .055]);
    const upperLeg = joint(hips.node, side * .135, -.09);
    const lowerLeg = joint(upperLeg.node, 0, -.35);
    const foot = joint(lowerLeg.node, 0, -.35);
    part(upperLeg.node, coat, [.097, .20, .095], 0, -.16);
    part(lowerLeg.node, ink, [.078, .19, .081], 0, -.16);
    part(foot.node, ink, [.091, .055, .145], 0, 0, .06);
    return { upperArm, lowerArm, hand, upperLeg, lowerLeg, foot };
  };
  const left = limb(1);
  const right = limb(-1);
  root.updateMatrixWorld(true);
  const humanoid = new VRMHumanoid({
    hips, spine, head, leftUpperArm: left.upperArm, leftLowerArm: left.lowerArm, leftHand: left.hand,
    leftUpperLeg: left.upperLeg, leftLowerLeg: left.lowerLeg, leftFoot: left.foot,
    rightUpperArm: right.upperArm, rightLowerArm: right.lowerArm, rightHand: right.hand,
    rightUpperLeg: right.upperLeg, rightLowerLeg: right.lowerLeg, rightFoot: right.foot,
  });
  const materials = [coat, face, ink, gold];
  return {
    root, humanoid, eyes, mouth, geometry, materials,
    expression(shape: MouthShape, weight: number, blink: number) {
      const [x, y] = mouthTargets[shape];
      mouth.scale.x = .10 + (x - .10) * weight;
      mouth.scale.y = .016 + (y - .016) * weight;
      for (const eye of eyes) eye.scale.y = .045 * (1 - .93 * blink);
    },
    dispose() {
      root.removeFromParent();
      geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
