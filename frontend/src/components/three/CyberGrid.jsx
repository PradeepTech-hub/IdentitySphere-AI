import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function Grid() {
  const ref = useRef();
  useFrame((state) => {
    ref.current.position.z = (state.clock.elapsedTime * 0.3) % 1;
  });
  return (
    <group ref={ref}>
      <gridHelper args={[40, 40, '#00d4ff', '#00d4ff']} rotation={[0, 0, 0]} position={[0, -2, 0]}>
        <meshBasicMaterial transparent opacity={0.06} />
      </gridHelper>
    </group>
  );
}

function FloatingParticles({ count = 30 }) {
  const ref = useRef();
  const positions = useRef(Array.from({ length: count }, () => [
    (Math.random() - 0.5) * 20,
    (Math.random() - 0.5) * 10,
    (Math.random() - 0.5) * 20,
  ]));
  useFrame((state) => {
    positions.current.forEach((p, i) => {
      p[1] += Math.sin(state.clock.elapsedTime + i) * 0.002;
    });
  });
  return (
    <>
      {positions.current.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.02, 6, 6]} />
          <meshBasicMaterial color={i % 3 === 0 ? '#ef4444' : '#00d4ff'} transparent opacity={0.4} />
        </mesh>
      ))}
    </>
  );
}

export default function CyberGrid({ className = '' }) {
  return (
    <div className={`absolute inset-0 ${className}`} style={{ zIndex: 0 }}>
      <Canvas camera={{ position: [0, 3, 8], fov: 60 }}>
        <Grid />
        <FloatingParticles />
      </Canvas>
    </div>
  );
}
