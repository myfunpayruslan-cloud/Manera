import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei';
import * as THREE from 'three';

export type DrinkKind = 'cappuccino' | 'latte' | 'espresso' | 'flat-white' | 'iced' | 'matcha';
type Props = { drink?: DrinkKind; interactive?: boolean };
const recipes: Record<DrinkKind, { radius: number; height: number; color: string; glass: boolean; foam: number }> = {
  cappuccino: { radius: .94, height: 1.05, color: '#c8b59b', glass: false, foam: .055 },
  latte: { radius: .66, height: 1.98, color: '#e9cfa6', glass: true, foam: .085 },
  espresso: { radius: .62, height: .76, color: '#694535', glass: false, foam: .008 },
  'flat-white': { radius: 1.04, height: .81, color: '#d3c9b3', glass: false, foam: .018 },
  iced: { radius: .77, height: 1.85, color: '#825438', glass: true, foam: .008 },
  matcha: { radius: .81, height: 1.22, color: '#a8af94', glass: false, foam: .04 },
};

// All assets are generated locally. No third-party model or texture licensing required.
function seeded(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function surfaceTexture(drink: DrinkKind) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
  const ctx = canvas.getContext('2d')!; const random = seeded(41);
  const matcha = drink === 'matcha', espresso = drink === 'espresso';
  const base = ctx.createRadialGradient(490, 480, 20, 512, 512, 512);
  base.addColorStop(0, matcha ? '#83984c' : espresso ? '#79401c' : '#b87840');
  base.addColorStop(.86, matcha ? '#6e853c' : espresso ? '#aa682b' : '#c38b4d');
  base.addColorStop(1, matcha ? '#435829' : '#633112'); ctx.fillStyle = base; ctx.fillRect(0, 0, 1024, 1024);
  // Fine bubbles and crema, seeded so snapshots and remounts remain stable.
  for (let i = 0; i < 27000; i++) {
    const x = random() * 1024, y = random() * 1024, r = random() * 2.2 + .25;
    ctx.fillStyle = `rgba(255,235,192,${random() * (espresso ? .24 : .12)})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  if (!espresso && drink !== 'iced') {
    ctx.save(); ctx.translate(512, 510); ctx.rotate(-.18); ctx.scale(1.18, 1.18);
    // Nested poured leaves: a rosetta with a heart-shaped crown and a fine draw-through.
    for (let i = 0; i < 12; i++) {
      const y = 182 - i * 30, width = 208 * Math.sin((i + 2) / 15 * Math.PI);
      ctx.fillStyle = i % 2 ? '#f8edcf' : '#ead9b4';
      ctx.beginPath(); ctx.moveTo(0, y + 30);
      ctx.bezierCurveTo(-width * .45, y + 25, -width * 1.2, y - 40, -width, y - 53);
      ctx.bezierCurveTo(-width * .78, y - 85, -25, y - 10, 0, y - 5);
      ctx.bezierCurveTo(25, y - 10, width * .78, y - 85, width, y - 53);
      ctx.bezierCurveTo(width * 1.2, y - 40, width * .45, y + 25, 0, y + 30); ctx.fill();
    }
    ctx.fillStyle = '#faf0d5'; ctx.beginPath(); ctx.moveTo(0, -175);
    ctx.bezierCurveTo(-150, -260, -55, -330, 0, -270); ctx.bezierCurveTo(55, -330, 150, -260, 0, -175); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4, -265); ctx.bezierCurveTo(-5, -50, -10, 170, 18, 285);
    ctx.lineTo(26, 290); ctx.bezierCurveTo(10, 140, 8, -70, 4, -265); ctx.fill(); ctx.restore();
  }
  for (let i = 0; i < 500; i++) {
    const a = random() * Math.PI * 2, rad = 470 + random() * 30;
    ctx.strokeStyle = 'rgba(255,232,190,.3)'; ctx.lineWidth = .7;
    ctx.beginPath(); ctx.arc(512 + Math.cos(a) * rad, 512 + Math.sin(a) * rad, 1 + random() * 4, 0, Math.PI * 2); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}
function ceramicTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d')!;
  const r = seeded(9); x.fillStyle = '#b8b8b8'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 11000; i++) { const v = 125 + Math.floor(r() * 100); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(r() * 256, r() * 256, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 2); return t;
}
function lathe(profile: number[][], segments = 96) {
  const curve = new THREE.CatmullRomCurve3(profile.map(([r, y]) => new THREE.Vector3(r, y, 0)), false, 'centripetal');
  return new THREE.LatheGeometry(curve.getPoints(100).map(p => new THREE.Vector2(Math.max(0, p.x), p.y)), segments);
}
function vesselGeometry(radius: number, height: number, glass: boolean, segments: number) {
  const r = radius, h = height, wall = glass ? .026 : .065;
  return lathe([
    [0, .035], [r * .46, .035], [r * .55, .06], [r * .56, .12],
    [r * .63, h * .2], [r * .8, h * .46], [r * .96, h * .83],
    [r, h - .025], [r - wall * .3, h + .008], [r - wall * .85, h + .002],
    [r - wall, h - .04], [r * .96 - wall, h * .83], [r * .8 - wall, h * .46],
    [r * .63 - wall, h * .22], [r * .46, .15], [0, .15],
  ], segments);
}
function foamGeometry(radius: number, dome: number) {
  const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
  const rings = 18, segments = 96;
  for (let j = 0; j <= rings; j++) for (let i = 0; i <= segments; i++) {
    const r = j / rings, a = i / segments * Math.PI * 2;
    vertices.push(Math.cos(a) * r * radius, (1 - r * r) * dome, Math.sin(a) * r * radius);
    uv.push(.5 + Math.cos(a) * r * .5, .5 + Math.sin(a) * r * .5);
    if (j < rings && i < segments) { const n = j * (segments + 1) + i; indices.push(n, n + 1, n + segments + 1, n + 1, n + segments + 2, n + segments + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
}
function Handle({ radius, height, color, bump }: { radius: number; height: number; color: string; bump: THREE.Texture }) {
  const geometry = useMemo(() => {
    const r = radius, h = height;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(r * .92, h * .84, 0), new THREE.Vector3(r + .3, h * .88, 0),
      new THREE.Vector3(r + .51, h * .68, 0), new THREE.Vector3(r + .44, h * .38, 0),
      new THREE.Vector3(r * .58, h * .25, 0),
    ]);
    return new THREE.TubeGeometry(curve, 64, .092, 16, false);
  }, [radius, height]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} castShadow><meshPhysicalMaterial color={color} roughness={.28} clearcoat={.65} clearcoatRoughness={.2} bumpMap={bump} bumpScale={.009}/></mesh>;
}
const steamVertex = `
 varying vec2 vUv; uniform float uTime; uniform float uSeed;
 void main(){vUv=uv;vec3 p=position;float t=uTime*.32+uSeed;
 p.x+=sin(p.y*3.4-t)*.13*uv.y+sin(p.y*6.0+t)*.045*uv.y;
 p.z+=cos(p.y*3.0-t)*.15*uv.y;
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`;
const steamFragment = `
 varying vec2 vUv;uniform float uTime;uniform float uSeed;
 void main(){float x=vUv.x;float y=vUv.y;
 float curl=sin(y*12.0-uTime*.55+uSeed)*.12+sin(y*23.0+uTime*.3)*.04;
 float ribbon=exp(-pow((x-.5+curl)*7.0,2.0));
 float wisps=.55+.45*sin(y*20.0-uTime*.7+x*7.0);
 float alpha=ribbon*smoothstep(0.0,.15,y)*pow(1.0-y,1.8)*(.05+wisps*.08);
 gl_FragColor=vec4(.92,.87,.78,alpha);}`;
function Steam({ height, reduced }: { height: number; reduced: boolean }) {
  const materials = useRef<(THREE.ShaderMaterial | null)[]>([]);
  useFrame(({ clock }) => { if (!reduced) materials.current.forEach(m => { if (m) m.uniforms.uTime.value = clock.elapsedTime; }); });
  return <group position={[0, height - .02, 0]}>{[0, 1, 2].map(i => <mesh key={i} position={[(i - 1) * .26, .83, 0]} rotation={[0, i * 1.1, 0]}>
    <planeGeometry args={[.7, 1.7, 12, 40]}/><shaderMaterial ref={m => { materials.current[i] = m; }} vertexShader={steamVertex} fragmentShader={steamFragment} uniforms={{ uTime: { value: 0 }, uSeed: { value: i * 2.3 } }} transparent depthWrite={false} side={THREE.DoubleSide}/>
  </mesh>)}</group>;
}
function LiquidLayers({ radius: r, height: h, iced }: { radius: number; height: number; iced: boolean }) {
  const geometry = useMemo(() => lathe([[0, .15], [r * .51, .15], [r * .58, h * .22], [r * .75, h * .46], [r * .91, h * .83], [r - .045, h - .08], [0, h - .08]], 96), [r, h]);
  const material = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({ roughness: .42, clearcoat: .12 });
    m.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec3 vLiquidPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLiquidPosition = position;');
      shader.fragmentShader = 'varying vec3 vLiquidPosition;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float level = vLiquidPosition.y / ${h.toFixed(3)};
        float swirl = sin(vLiquidPosition.x * 9.0 + level * 14.0) * .022;
        vec3 milk = vec3(${iced ? '.38,.19,.075' : '.79,.65,.45'});
        vec3 coffee = vec3(${iced ? '.095,.032,.008' : '.32,.14,.045'});
        vec3 foam = vec3(.91,.83,.65);
        vec3 layers = mix(milk, coffee, smoothstep(.38 + swirl, .67 + swirl, level));
        ${iced ? '' : 'layers = mix(layers, foam, smoothstep(.83, .91, level));'}
        diffuseColor.rgb *= layers;
      `);
    };
    m.customProgramCacheKey = () => `liquid-${h}-${iced}`;
    return m;
  }, [h, iced]);
  useEffect(() => () => { geometry.dispose(); }, [geometry]);
  useEffect(() => () => { material.dispose(); }, [material]);
  return <mesh geometry={geometry} material={material}/>;
}
function Beverage({ drink, small, reduced }: { drink: DrinkKind; small: boolean; reduced: boolean }) {
  const recipe = recipes[drink]; const { radius: r, height: h, glass, color } = recipe;
  const texture = useMemo(() => surfaceTexture(drink), [drink]);
  const bump = useMemo(ceramicTexture, []);
  const geometry = useMemo(() => vesselGeometry(r, h, glass, small ? 64 : 128), [r, h, glass, small]);
  const saucer = useMemo(() => lathe([[0, -.03], [.46, -.03], [.59, -.06], [.75, -.055], [1.1, .005], [1.42, .12], [1.48, .155], [1.47, .18], [1.39, .19], [1.05, .095], [.74, .04], [.58, .035], [0, .035]], small ? 64 : 128), [small]);
  useEffect(() => () => { texture.dispose(); }, [texture]);
  useEffect(() => () => { bump.dispose(); saucer.dispose(); }, [bump, saucer]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const foam = useMemo(() => foamGeometry(r - (glass ? .045 : .083), recipe.foam), [r, glass, recipe.foam]);
  useEffect(() => () => foam.dispose(), [foam]);
  const surfaceY = h - .065;
  const liquidR = r - (glass ? .045 : .083);
  return <group position={[glass ? -.1 : -.13, glass ? -.8 : -.45, 0]}>
    {!glass && <mesh geometry={saucer} position={[0, -.07, 0]} scale={drink === 'espresso' ? .75 : 1} receiveShadow castShadow>
      <meshPhysicalMaterial color={color} roughness={.32} clearcoat={.5} bumpMap={bump} bumpScale={.008}/>
    </mesh>}
    <mesh geometry={geometry} castShadow={!glass} renderOrder={glass ? 2 : 0}>
      {glass ? <meshPhysicalMaterial color="#fff9ec" metalness={0} roughness={.065} transmission={small ? .7 : .94} thickness={.04} ior={1.46} transparent opacity={.42} envMapIntensity={1.4} depthWrite={false} side={THREE.DoubleSide}/> :
        <meshPhysicalMaterial color={color} metalness={0} roughness={.27} clearcoat={.7} clearcoatRoughness={.23} bumpMap={bump} bumpScale={.012}/>}
    </mesh>
    {!glass && <Handle radius={r} height={h} color={color} bump={bump}/>}
    {glass && <LiquidLayers radius={r} height={h} iced={drink === 'iced'}/>}
    <mesh position={[0, surfaceY - recipe.foam / 2, 0]}>
      <cylinderGeometry args={[liquidR, liquidR * .99, Math.max(.012, recipe.foam), 96]}/>
      <meshStandardMaterial color={drink === 'matcha' ? '#c4cea0' : drink === 'espresso' ? '#6f381c' : '#e9d9b7'} roughness={.65}/>
    </mesh>
    <mesh geometry={foam} rotation={[0, Math.PI - .3, 0]} position={[0, surfaceY + .004, 0]}>
      <meshPhysicalMaterial map={texture} roughness={drink === 'espresso' ? .3 : .56} clearcoat={.18} bumpMap={texture} bumpScale={.003} side={THREE.DoubleSide}/>
    </mesh>
    {drink === 'iced' && <group position={[0, surfaceY - .08, 0]}>{Array.from({ length: 6 }, (_, i) => <RoundedBox key={i} args={[.34, .31, .34]} radius={.055} smoothness={small ? 2 : 4} position={[Math.sin(i * 2.4) * .4, i % 2 * .09, Math.cos(i * 2.4) * .4]} rotation={[i * .2, i, .14]}>
      <meshPhysicalMaterial color="#e4e6dd" roughness={.12} transmission={.65} thickness={.25} ior={1.31} transparent opacity={.7} envMapIntensity={1.2}/>
    </RoundedBox>)}</group>}
    {drink !== 'iced' && <Steam height={h} reduced={reduced}/>}
  </group>;
}
function RoastedBeans({ reduced }: { reduced: boolean }) {
  const group = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const g = new THREE.SphereGeometry(1, 32, 24), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const groove = Math.exp(-Math.pow((x + Math.sin(y * 3) * .08) * 9, 2)) * .16 * Math.max(0, z);
      p.setXYZ(i, x * .15, y * .23, z * .115 - groove);
    } g.computeVertexNormals(); return g;
  }, []);
  const bump = useMemo(ceramicTexture, []);
  useEffect(() => () => { geometry.dispose(); bump.dispose(); }, [geometry, bump]);
  useFrame(({ clock }, delta) => {
    if (!group.current || reduced) return;
    const scroll = Math.min(window.scrollY / window.innerHeight, 1);
    group.current.rotation.y = Math.sin(clock.elapsedTime * .12) * .1;
    group.current.scale.lerp(new THREE.Vector3().setScalar(1 + scroll * .45), 1 - Math.exp(-delta * 3));
    group.current.children.forEach((bean, i) => { bean.rotation.z = i + Math.sin(clock.elapsedTime * .35 + i) * .13; });
  });
  return <group ref={group}>{[[-1.9, .2, .3], [1.6, 1.6, -.7], [-1.55, 1.85, -1], [1.9, -.4, .5], [-.7, -1.05, .8]].map((p, i) => <mesh key={i} geometry={geometry} position={p as [number, number, number]} rotation={[.5 + i, .3 + i, i]} castShadow>
    <meshStandardMaterial color={i % 2 ? '#422216' : '#633823'} roughness={.66} bumpMap={bump} bumpScale={.045}/>
  </mesh>)}</group>;
}
function Composition({ drink, interactive, small, reduced }: { drink: DrinkKind; interactive: boolean; small: boolean; reduced: boolean }) {
  const group = useRef<THREE.Group>(null); const entered = useRef(0);
  useEffect(() => { entered.current = 0; }, [drink]);
  useFrame(({ clock, pointer, camera }, delta) => {
    if (!group.current) return;
    const t = clock.elapsedTime, ease = 1 - Math.exp(-Math.min(delta, .05) * 4);
    entered.current = reduced ? 1 : THREE.MathUtils.lerp(entered.current, 1, ease);
    const s = .93 + entered.current * .07; group.current.scale.setScalar(s);
    group.current.position.y = reduced ? 0 : Math.sin(t * .65) * .035 - (1 - entered.current) * .16;
    if (!interactive) {
      const scroll = reduced ? 0 : Math.min(window.scrollY / window.innerHeight, 1);
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, -.28 + (reduced ? 0 : pointer.x * .12 + Math.sin(t * .2) * .045), ease);
      group.current.rotation.z = reduced ? -.07 : -.07 + Math.sin(t * .45) * .015;
      camera.position.lerp(new THREE.Vector3(scroll * .7, 2.7 - scroll * .35, 5.6 - scroll * .45), ease);
      camera.lookAt(0, .35, 0);
    }
  });
  return <group ref={group}><Beverage key={drink} drink={drink} small={small} reduced={reduced}/></group>;
}
export default function CoffeeScene({ drink = 'cappuccino', interactive = false }: Props) {
  const host = useRef<HTMLDivElement>(null); const [visible, setVisible] = useState(true);
  const [small, setSmall] = useState(() => window.matchMedia('(max-width: 650px)').matches);
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 650px)'), motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setSmall(mobile.matches); setReduced(motion.matches); };
    mobile.addEventListener('change', update); motion.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '100px' });
    if (host.current) observer.observe(host.current);
    return () => { observer.disconnect(); mobile.removeEventListener('change', update); motion.removeEventListener('change', update); };
  }, []);
  const cool = drink === 'matcha' || drink === 'iced';
  return <div ref={host} className="coffee-canvas" data-drink={drink} role="img" aria-label={`3D ${drink}${interactive ? ', вращайте мышью или пальцем' : ''}`}>
    <Canvas frameloop={visible && !reduced ? 'always' : 'demand'} dpr={[1, small ? 1.15 : 1.75]} camera={{ position: [0, 2.7, 5.6], fov: interactive ? 36 : 35 }} gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
      <ambientLight intensity={.32}/>
      <directionalLight position={[-3, 5, 4]} intensity={2.1} color="#fff0db"/>
      <directionalLight position={[4, 2, -3]} intensity={cool ? 1.3 : .9} color={cool ? '#e2eddf' : '#dbb389'}/>
      <Suspense fallback={null}>
        <Environment resolution={small ? 64 : 256} frames={1}>
          <Lightformer position={[-3, 4, 3]} rotation={[0, .4, -.3]} scale={[3, 5, 1]} intensity={3.5}/>
          <Lightformer position={[4, 2, 1]} rotation={[0, -Math.PI / 2, 0]} scale={[1, 5, 1]} intensity={2} color={cool ? '#dfede0' : '#f2dcc1'}/>
          <Lightformer position={[0, 5, -3]} rotation={[Math.PI / 2, 0, 0]} scale={[5, 3, 1]} intensity={2.5}/>
          <Lightformer position={[0, 1, 5]} scale={[4, 2, 1]} intensity={.5}/>
        </Environment>
        <Composition drink={drink} interactive={interactive} small={small} reduced={reduced}/>
        {!interactive && !small && <RoastedBeans reduced={reduced}/>}
        <ContactShadows position={[0, -1.08, 0]} opacity={.38} scale={8} blur={2.8} far={4} resolution={small ? 128 : 256} frames={reduced ? 1 : Infinity} color="#100b07"/>
      </Suspense>
      {interactive && <OrbitControls key={drink} makeDefault target={[0, .35, 0]} enableZoom={false} enablePan={false} enableDamping dampingFactor={.07} minPolarAngle={.45} maxPolarAngle={1.48} autoRotate={!reduced} autoRotateSpeed={.28}/>}
    </Canvas>
  </div>;
}
