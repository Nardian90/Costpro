'use client';

import React, { useEffect, useRef } from 'react';

/**
 * Building3DCanvas — Canvas WebGL con Three.js que renderiza:
 *   - Edificios del negocio (BoxGeometry con MeshPhysicalMaterial)
 *   - Elementos de costo flotantes (IcosahedronGeometry)
 *   - Líneas de conexión
 *   - Partículas atmosféricas
 *   - Gráfico del dólar (línea 3D)
 *   - Escudo de protección (Torus)
 *
 * La cámara se mueve y rota según el progreso del scroll de la sección padre.
 * Se carga Three.js dinámicamente via CDN script tag.
 */

interface Building3DCanvasProps {
  scrollProgress: number; // 0 to 1
}

export default function Building3DCanvas({ scrollProgress }: Building3DCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeRef = useRef<any>(null);
  const progressRef = useRef(scrollProgress);

  // Keep progressRef updated without re-initializing Three.js
  useEffect(() => {
    progressRef.current = scrollProgress;
  }, [scrollProgress]);

  useEffect(() => {
    let mounted = true;

    // Load Three.js from CDN
    const script = document.createElement('script');
    script.type = 'importmap';
    script.textContent = JSON.stringify({
      imports: {
        three: 'https://unpkg.com/three@0.160.0/build/three.module.js',
      },
    });
    document.head.appendChild(script);

    const moduleScript = document.createElement('script');
    moduleScript.type = 'module';
    moduleScript.textContent = `
      import * as THREE from 'three';

      const ACCENT = 0x00E5A0;
      const WARNING = 0xFFB800;
      const DANGER = 0xFF3366;
      const EPS = 0.001;

      const COST_DATA = [
        { color: 0xFF6B35, size: 0.28 },
        { color: 0x3B82F6, size: 0.24 },
        { color: 0xFFB800, size: 0.20 },
        { color: 0x8B5CF6, size: 0.22 },
        { color: 0xEF4444, size: 0.26 },
        { color: 0x06B6D4, size: 0.23 },
      ];

      const canvas = document.getElementById('building-3d-canvas');
      if (!canvas) { console.error('Canvas not found'); return; }

      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x06060B, 0.045);

      const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 100);
      camera.position.set(7, 5.5, 7);

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;

      // Lighting
      scene.add(new THREE.AmbientLight(0xffffff, 0.35));
      const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
      keyLight.position.set(5, 10, 5);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(ACCENT, 0.25);
      fillLight.position.set(-6, 4, -4);
      scene.add(fillLight);
      const rimLight = new THREE.PointLight(ACCENT, 0.6, 15);
      rimLight.position.set(0, 6, -5);
      scene.add(rimLight);

      // Buildings
      const businessGroup = new THREE.Group();
      const bldMat = new THREE.MeshPhysicalMaterial({
        color: 0x0c1a2e, metalness: 0.45, roughness: 0.12,
        transparent: true, opacity: 0.88, emissive: ACCENT,
        emissiveIntensity: 0.015, clearcoat: 0.6, clearcoatRoughness: 0.15,
      });
      const buildings = [
        { w: 1.8, h: 3.8, d: 1.8, x: 0, z: 0 },
        { w: 1.2, h: 2.2, d: 1.2, x: -2.1, z: 0.6 },
        { w: 1.0, h: 3.0, d: 1.0, x: 1.9, z: -0.4 },
        { w: 0.8, h: 1.6, d: 0.8, x: -0.6, z: 2.0 },
        { w: 0.7, h: 1.3, d: 0.7, x: 1.2, z: 1.8 },
      ];
      buildings.forEach(b => {
        const geo = new THREE.BoxGeometry(Math.max(EPS, b.w), Math.max(EPS, b.h), Math.max(EPS, b.d));
        const mesh = new THREE.Mesh(geo, bldMat);
        mesh.position.set(b.x, b.h / 2, b.z);
        businessGroup.add(mesh);
        const edgeGeo = new THREE.EdgesGeometry(geo);
        const edgeMat = new THREE.LineBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.22 });
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        edges.position.copy(mesh.position);
        businessGroup.add(edges);
      });
      // Ground
      const groundGeo = new THREE.PlaneGeometry(30, 30);
      const groundMat = new THREE.MeshStandardMaterial({ color: 0x06060B, metalness: 0.9, roughness: 0.25 });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.02;
      businessGroup.add(ground);
      // Grid
      const grid = new THREE.GridHelper(30, 60, ACCENT, 0x0a1628);
      grid.material.transparent = true;
      grid.material.opacity = 0.1;
      businessGroup.add(grid);
      scene.add(businessGroup);

      // Cost elements (icosahedrons)
      const costMeshes = [];
      const costGroup = new THREE.Group();
      COST_DATA.forEach((c, i) => {
        const geo = new THREE.IcosahedronGeometry(Math.max(EPS, c.size), 1);
        const mat = new THREE.MeshPhysicalMaterial({
          color: c.color, emissive: c.color, emissiveIntensity: 0.55,
          metalness: 0.15, roughness: 0.3, transparent: true, opacity: 0,
        });
        const mesh = new THREE.Mesh(geo, mat);
        const angle = (i / COST_DATA.length) * Math.PI * 2;
        const radius = 3.2 + Math.random() * 0.8;
        const baseY = 1.2 + Math.random() * 2.2;
        mesh.position.set(Math.cos(angle) * radius, baseY, Math.sin(angle) * radius);
        mesh.userData = { angle, radius, baseY, speed: 0.25 + Math.random() * 0.35, idx: i };
        costGroup.add(mesh);
        costMeshes.push(mesh);
      });
      scene.add(costGroup);

      // Particles
      const particleCount = 700;
      const particlePositions = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount; i++) {
        particlePositions[i * 3] = (Math.random() - 0.5) * 24;
        particlePositions[i * 3 + 1] = Math.random() * 12;
        particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 24;
      }
      const particleGeo = new THREE.BufferGeometry();
      particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
      const particleMat = new THREE.PointsMaterial({ color: ACCENT, size: 0.025, transparent: true, opacity: 0.35, sizeAttenuation: true });
      const particles = new THREE.Points(particleGeo, particleMat);
      scene.add(particles);

      // Camera states per scene
      const camStates = [
        { pos: new THREE.Vector3(7, 5.5, 7), look: new THREE.Vector3(0, 1.5, 0) },
        { pos: new THREE.Vector3(3.5, 3.5, 3.5), look: new THREE.Vector3(0, 2, 0) },
        { pos: new THREE.Vector3(0, 5.5, 6), look: new THREE.Vector3(0, 1, 0) },
        { pos: new THREE.Vector3(5, 3.5, -1.5), look: new THREE.Vector3(0, 2.5, -1) },
        { pos: new THREE.Vector3(5, 3.5, -1.5), look: new THREE.Vector3(0, 2.5, -1) },
        { pos: new THREE.Vector3(6, 5, 6), look: new THREE.Vector3(0, 1.5, 0) },
        { pos: new THREE.Vector3(0, 3, 9), look: new THREE.Vector3(0, 1.5, 0) },
      ];
      const curCamPos = camStates[0].pos.clone();
      const curCamLook = camStates[0].look.clone();

      const clock = new THREE.Clock();
      let totalTime = 0;

      function updateScene3D(t) {
        totalTime = clock.getElapsedTime();
        const n = camStates.length - 1;
        const ci = Math.min(Math.floor(t * n), n - 1);
        const lt = (t * n) - ci;
        const smoothT = lt * lt * (3 - 2 * lt);
        curCamPos.lerpVectors(camStates[ci].pos, camStates[ci + 1].pos, smoothT);
        curCamLook.lerpVectors(camStates[ci].look, camStates[ci + 1].look, smoothT);

        const sceneIdx = Math.min(Math.floor(t * 7), 6);
        const sceneT = (t * 7) - sceneIdx;

        if (sceneIdx === 4 && sceneT > 0.3) {
          const shake = (sceneT - 0.3) * 0.04;
          curCamPos.x += (Math.random() - 0.5) * shake;
          curCamPos.y += (Math.random() - 0.5) * shake;
        }

        camera.position.copy(curCamPos);
        camera.lookAt(curCamLook);

        costMeshes.forEach((cm, i) => {
          const mat = cm.material;
          const ud = cm.userData;
          if (sceneIdx === 0) { mat.opacity = 0; }
          else if (sceneIdx === 1) {
            const delay = i * 0.12;
            const localT = Math.max(0, Math.min(1, (sceneT - delay) / 0.25));
            mat.opacity = localT * 0.9;
            const a = ud.angle + totalTime * 0.4 * ud.speed;
            cm.position.x = Math.cos(a) * ud.radius;
            cm.position.z = Math.sin(a) * ud.radius;
            cm.position.y = ud.baseY + Math.sin(totalTime * 1.5 + i * 1.2) * 0.35;
          } else if (sceneIdx === 2) {
            const tx = -1.8 + (i % 3) * 1.5;
            const ty = 0.6 + Math.floor(i / 3) * 0.9;
            cm.position.x += (tx - cm.position.x) * 0.06;
            cm.position.y += (ty - cm.position.y) * 0.06;
            cm.position.z += (2.5 - cm.position.z) * 0.06;
            mat.opacity = 0.65; mat.emissiveIntensity = 0.3;
          } else if (sceneIdx >= 3) {
            cm.position.y += (ud.baseY - cm.position.y) * 0.04;
            cm.position.x += (Math.cos(ud.angle + totalTime * 0.2) * ud.radius - cm.position.x) * 0.03;
            cm.position.z += (Math.sin(ud.angle + totalTime * 0.2) * ud.radius - cm.position.z) * 0.03;
            mat.emissiveIntensity = 0.55 + Math.sin(totalTime * 3 + i) * 0.3;
            mat.opacity = 0.8;
            if (sceneIdx === 4) {
              mat.emissive.setHex(DANGER); mat.color.setHex(DANGER);
              mat.emissiveIntensity = 0.5 + Math.sin(totalTime * 8 + i) * 0.5; mat.opacity = 0.9;
            } else if (sceneIdx === 5) {
              mat.color.lerp(new THREE.Color(COST_DATA[i].color), 0.03);
              mat.emissive.lerp(new THREE.Color(COST_DATA[i].color), 0.03);
            }
          }
          cm.rotation.y += 0.004 * ud.speed;
          cm.rotation.x += 0.002 * ud.speed;
        });

        // Particles
        const posArr = particles.geometry.attributes.position.array;
        for (let i = 0; i < posArr.length; i += 3) {
          posArr[i + 1] += 0.003;
          if (posArr[i + 1] > 12) posArr[i + 1] = 0;
        }
        particles.geometry.attributes.position.needsUpdate = true;

        if (sceneIdx === 4) {
          particles.material.color.lerp(new THREE.Color(DANGER), 0.02);
          particles.material.opacity = 0.5;
          fillLight.color.lerp(new THREE.Color(DANGER), 0.02);
          rimLight.color.lerp(new THREE.Color(DANGER), 0.02);
        } else if (sceneIdx === 5) {
          particles.material.color.lerp(new THREE.Color(ACCENT), 0.03);
          particles.material.opacity = 0.45;
          fillLight.color.lerp(new THREE.Color(ACCENT), 0.03);
          rimLight.color.lerp(new THREE.Color(ACCENT), 0.03);
          rimLight.intensity += (1.0 - rimLight.intensity) * 0.02;
        } else {
          particles.material.color.lerp(new THREE.Color(ACCENT), 0.02);
          particles.material.opacity = 0.35;
          fillLight.color.lerp(new THREE.Color(ACCENT), 0.02);
          rimLight.color.lerp(new THREE.Color(ACCENT), 0.02);
        }

        // Canvas fade in scene 7
        if (sceneIdx === 6 && sceneT > 0.4) {
          canvas.style.opacity = String(1 - (sceneT - 0.4) / 0.6);
        } else {
          canvas.style.opacity = '1';
        }
      }

      // Animation loop
      let animId;
      function animate() {
        animId = requestAnimationFrame(animate);
        const t = window.__costStoryProgress || 0;
        updateScene3D(t);
        renderer.render(scene, camera);
      }
      animate();

      // Resize
      function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
      window.addEventListener('resize', onResize);

      // Cleanup function stored globally
      window.__costStoryCleanup = () => {
        cancelAnimationFrame(animId);
        window.removeEventListener('resize', onResize);
        renderer.dispose();
        scene.traverse(obj => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) { if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose()); else obj.material.dispose(); }
        });
      };
    `;

    // Wait for importmap to be ready, then add module script
    setTimeout(() => {
      if (mounted) document.head.appendChild(moduleScript);
    }, 100);

    return () => {
      mounted = false;
      const w = window as any;
      if (w.__costStoryCleanup) {
        w.__costStoryCleanup();
        w.__costStoryCleanup = null;
      }
      if (script.parentNode) script.parentNode.removeChild(script);
      if (moduleScript.parentNode) moduleScript.parentNode.removeChild(moduleScript);
    };
  }, []);

  return (
    <>
      <canvas
        id="building-3d-canvas"
        ref={canvasRef}
        className="fixed inset-0 z-0 pointer-events-none"
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
      {/* Cinematic vignette */}
      <div
        className="fixed inset-0 z-1 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(6,6,11,0.7) 100%)' }}
      />
    </>
  );
}
