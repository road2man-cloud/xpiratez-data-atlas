/**
 * X-Piratez F11 / R36KP family - deterministic thigh abduction.
 *
 * In donor bind coordinates: L_Thigh is on +X, R_Thigh on -X, the knees
 * extend primarily toward -Z, and the glTF parent turns Z-up into Y-up.
 * For an outward spread about each thigh's local Y axis, LEFT is NEGATIVE
 * and RIGHT is POSITIVE. The legacy sliders accidentally reversed both.
 *
 * All joints reset to their original bind quaternions before applying a pose.
 * The result contains measured knee-center separation in model units.
 * In case a mirrored future rig is supplied, choose the orientation that
 * genuinely moves both knees outward relative to their neutral positions.
 */
export function applyThighSpread(root, boneBases, THREE, degrees) {
  const angle = Math.max(0, Math.min(70, Number(degrees) || 0)) * Math.PI / 180;
  if (!root) return null;
  let left = null;
  let right = null;
  root.traverse(bone => {
    if (!bone.isBone) return;
    const neutral = boneBases.get(bone);
    if (neutral) bone.quaternion.copy(neutral);
    if (/^L_Thigh$/i.test(bone.name)) left = bone;
    else if (/^R_Thigh$/i.test(bone.name)) right = bone;
  });

  if (!left || !right) {
    root.updateMatrixWorld(true);
    return null;
  }
  const findKnee = thigh => {
    let knee = thigh.children.find(o => o.isBone && /^(?:L|R)_(?:Leg|Knee|Shin)$/i.test(o.name));
    if (!knee) knee = thigh.children.find(o => o.isBone);
    return knee || null;
  };
  const leftKnee = findKnee(left);
  const rightKnee = findKnee(right);
  if (!leftKnee || !rightKnee) {
    root.updateMatrixWorld(true);
    return null;
  }

  const world = object => object.getWorldPosition(new THREE.Vector3());
  root.updateMatrixWorld(true);
  const leftHip = world(left), rightHip = world(right);
  const lateral = leftHip.clone().sub(rightHip).normalize();
  const leftNeutral = world(leftKnee), rightNeutral = world(rightKnee);
  const neutralSpan = leftNeutral.clone().sub(rightNeutral).dot(lateral);

  const localYAxis = new THREE.Vector3(0, 1, 0);
  function applyWith(sign) {
    // Negative left and positive right produce real abduction for R36HW/JB.
    left.quaternion.copy(boneBases.get(left))
      .multiply(new THREE.Quaternion().setFromAxisAngle(localYAxis, -angle * sign));
    right.quaternion.copy(boneBases.get(right))
      .multiply(new THREE.Quaternion().setFromAxisAngle(localYAxis, angle * sign));
    root.updateMatrixWorld(true);
    const leftWorld = world(leftKnee);
    const rightWorld = world(rightKnee);
    return {
      kneeSpan: leftWorld.clone().sub(rightWorld).dot(lateral),
      leftOutward: leftWorld.clone().sub(leftNeutral).dot(lateral),
      rightOutward: rightNeutral.clone().sub(rightWorld).dot(lateral),
    };
  }
  let sign = 1;
  let measured = applyWith(sign);
  // A future mirrored asset can invert the bind space without inverting
  // the meaning of the user-facing "spread" slider.
  if (angle > 0 && (measured.leftOutward < -0.00001 || measured.rightOutward < -0.00001)) {
    const alternate = applyWith(-1);
    if (Math.min(alternate.leftOutward, alternate.rightOutward) >
        Math.min(measured.leftOutward, measured.rightOutward)) {
      sign = -1;
      measured = alternate;
    } else {
      measured = applyWith(1);
    }
  }
  return {
    degrees: angle * 180 / Math.PI,
    neutralSpan,
    kneeSpan: measured.kneeSpan,
    extraSpan: measured.kneeSpan - neutralSpan,
    leftOutward: measured.leftOutward,
    rightOutward: measured.rightOutward,
    mirroredRig: sign < 0,
    outward: angle <= 0.000001 ||
      (measured.leftOutward >= -0.00001 && measured.rightOutward >= -0.00001 &&
       measured.kneeSpan >= neutralSpan - 0.00001),
  };
}
