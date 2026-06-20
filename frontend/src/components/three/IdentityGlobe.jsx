import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sphere, Line, Float } from '@react-three/drei';
import * as THREE from 'three';

function NetworkNodes({ count = 80 }) {
  const meshRef = useRef();
  const points = useMemo(() => {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = 2 * Math.PI * Math.random();
      const r = 2.2 + Math.random() * 0.3;
      pts.push(new THREE.Vector3(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      ));
    }
    return pts;
  }, [count]);

  const connections = useMemo(() => {
    const lines = [];
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        if (points[i].distanceTo(points[j]) < 1.2) {
          lines.push([points[i].toArray(), points[j].toArray()]);
        }
      }
    }
    return lines;
  }, [points]);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.08;
  });

  const nodeColors = ['#E31937', '#f97316', '#3b82f6', '#22c55e', '#FF3355'];

  return (
    <group ref={meshRef}>
      <Sphere args={[2, 32, 32]}>
        <meshBasicMaterial color="#0d1226" transparent opacity={0.3} wireframe />
      </Sphere>
      {points.map((p, i) => (
        <Float key={i} speed={1 + Math.random()} floatIntensity={0.3}>
          <mesh position={p}>
            <sphereGeometry args={[0.03 + Math.random() * 0.03, 8, 8]} />
            <meshBasicMaterial color={nodeColors[i % nodeColors.length]} />
          </mesh>
        </Float>
      ))}
      {connections.map((line, i) => (
        <Line key={i} points={line} color="#E31937" lineWidth={0.5} transparent opacity={0.2} />
      ))}
    </group>
  );
}

function GlowSphere() {
  const ref = useRef();
  useFrame((state) => {
    ref.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 0.5) * 0.05);
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[2.6, 32, 32]} />
      <meshBasicMaterial color="#E31937" transparent opacity={0.04} side={THREE.BackSide} />
    </mesh>
  );
}

export default function IdentityGlobe({ className = '' }) {
  return (
    <div className={`${className}`}>
      <Canvas camera={{ position: [0, 0, 5.5], fov: 50 }} style={{ background: 'transparent' }}>
        <ambientLight intensity={0.5} />
        <NetworkNodes />
        <GlowSphere />
        <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.3} enablePan={false} />
      </Canvas>
    </div>
  );
}
