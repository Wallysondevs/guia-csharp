/* cs-worker.js — Web Worker (módulo) do editor C# do guia (assets/csharpsim.js).
   papel "compilador": carrega o Roslyn e os reference assemblies e compila (fica vivo).
   papel "executor": um runtime .NET novo para UM programa (a caixa cria outro para a próxima vez).
   Os pacotes (.pak.gz) vêm da Cache API (baixados só na primeira vez) e são descomprimidos aqui. */
import { lerPacote, configurar, estouroDePilha } from "./cs-comum.mjs";

const CACHE = "guia-csharp-motor";
let papel = null, ex = null, filaEntradas = [], interativo = false, erroNativo = "", inicio = null;

// números "aleatórios" com semente: quando o programa pede entrada, a caixa roda de novo o programa
// com as linhas digitadas, e o Random tem de sortear os mesmos números (ver CONTRIBUINDO §4)
let estado = (Math.random() * 4294967296) >>> 0;
function prng() { estado = (estado + 0x6D2B79F5) >>> 0; let t = estado; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) >>> 0; }
try {
  self.crypto.getRandomValues = function (arr) {
    const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < u8.length; i++) u8[i] = prng() & 255;
    return arr;
  };
} catch (e) { /* sem semente: o Random muda a cada repetição */ }

function enviar(m, t) { self.postMessage(m, t || []); }

async function obter(nome, versao, tamanho, progresso) {
  const url = new URL(nome + "?v=" + versao, import.meta.url).href;
  let cache = null;
  try { cache = await caches.open(CACHE); } catch (e) { /* sem Cache API (ex.: file://) */ }
  let resp = cache ? await cache.match(url) : null;
  let bytes;
  if (resp) { bytes = new Uint8Array(await resp.arrayBuffer()); progresso(bytes.length); }
  else {
    resp = await fetch(url);
    if (!resp.ok) throw new Error("não consegui baixar " + nome + " (HTTP " + resp.status + ")");
    const leitor = resp.body.getReader(), partes = [];
    let lidos = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      partes.push(value); lidos += value.length; progresso(value.length);
    }
    bytes = new Uint8Array(lidos);
    let p = 0; for (const x of partes) { bytes.set(x, p); p += x.length; }
    if (cache) {
      try {
        await cache.put(url, new Response(bytes, { headers: { "content-type": "application/octet-stream" } }));
        // apaga as versões antigas
        for (const k of await cache.keys()) { const u = new URL(k.url); if (u.pathname.endsWith("/" + nome) && u.search !== "?v=" + versao) await cache.delete(k); }
      } catch (e) { /* cota cheia: baixa de novo na próxima vez */ }
    }
  }
  // gzip → bytes (DecompressionStream)
  const ds = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")));
  return new Uint8Array(await ds.arrayBuffer());
}

async function carregar(m) {
  papel = m.papel;
  const nomes = papel === "compilador" ? ["motor.pak.gz", "refs.pak.gz"] : ["motor.pak.gz"];
  const total = nomes.reduce((s, n) => s + (m.tamanhos[n] || 0), 0);
  let lidos = 0, ultimo = 0;
  const prog = (n) => { lidos += n; const ag = Date.now(); if (ag - ultimo > 100 || lidos >= total) { ultimo = ag; enviar({ ev: "progresso", lidos, total }); } };
  const [motor, refs] = await Promise.all(nomes.map((n) => obter(n, m.versao, m.tamanhos[n], prog)));
  enviar({ ev: "preparando" });
  // num Web Worker, o dotnet.js acha que é uma thread do próprio runtime, a menos que seja um "sidecar"
  self.dotnetSidecar = true;
  // executor: o relógio fica parado enquanto o runtime inicia o gerador de números (ver Executor.Aquecer)
  const agora = Date.now;
  if (papel === "executor") Date.now = () => 1700000000000;
  const { dotnet } = await import("./dotnet.js");
  const rt = await configurar(dotnet, lerPacote(motor), { depurar: papel === "executor", erroNativo: (t) => { if (erroNativo.length < 2e6) erroNativo += t; } }).create();
  rt.setModuleImports("motor", {
    escrever(fd, s) { enviar({ ev: "saida", fd, s }); },
    lerEntrada() {
      // cada entrada é uma linha digitada com o "\n"; "" = Ctrl+D (fim da entrada)
      if (filaEntradas.length) { const l = filaEntradas.shift(); if (l) enviar({ ev: "eco", s: l }); return l; }
      if (!interativo) { enviar({ ev: "leu" }); return ""; }
      return null; // o C# chama pedirEntrada() e encerra com Environment.Exit(250)
    },
    inicio(q) { inicio = q; },
  pedirEntrada() { enviar({ ev: "espera" }); },
  });
  ex = (await rt.getAssemblyExports("Motor.dll")).Motor;
  if (papel === "executor") { try { ex.Executor.Aquecer(); } catch (e) { /* ok */ } Date.now = agora; }
  if (papel === "compilador") {
    ex.Compilador.CarregarReferencias(refs);
    // aquece o Roslyn (a 1ª compilação é a mais lenta)
    try { await ex.Compilador.Compilar(JSON.stringify({ arquivos: [{ nome: "Aquece.cs", codigo: "System.Console.WriteLine(1);" }], pasta: "/home/ana/cs", projeto: null, nome: "Aquece" })); } catch (e) { /* ok */ }
  }
  enviar({ ev: "pronto" });
}

async function compilar(m) {
  const r = JSON.parse(await ex.Compilador.Compilar(JSON.stringify({ arquivos: m.arquivos, pasta: m.pasta, projeto: m.projeto, nome: m.nome })));
  const dll = r.ok ? ex.Compilador.Dll().slice() : new Uint8Array(0), pdb = r.ok ? ex.Compilador.Pdb().slice() : new Uint8Array(0);
  enviar({ ev: "compilado", id: m.id, r, dll, pdb }, [dll.buffer, pdb.buffer]);
}

async function rodar(m) {
  if (typeof m.semente === "number") estado = m.semente >>> 0;
  filaEntradas = (m.entradas || []).slice();
  interativo = !!m.interativo;
  try {
    const codigo = await ex.Executor.Rodar(new Uint8Array(m.dll), new Uint8Array(m.pdb), m.args || [], m.pasta, m.nomes || [], m.conteudos || [], m.stdin === undefined ? null : m.stdin, m.arquivoUnico || "", m.chaves || "");
    enviar({ ev: "fim", id: m.id, exit: codigo });
  } catch (e) {
    const so = estouroDePilha(erroNativo, inicio);
    if (so) { enviar({ ev: "saida", fd: 2, s: so }); enviar({ ev: "fim", id: m.id, exit: 134 }); }
    else if (e && typeof e.status === "number") enviar({ ev: "fim", id: m.id, exit: e.status }); // Environment.Exit(n)
    else enviar({ ev: "falha", id: m.id, msg: String((e && e.stack) || e) });
  }
}

self.onmessage = (e) => {
  const m = e.data;
  if (m.op === "carregar") carregar(m).catch((x) => enviar({ ev: "falha", msg: String((x && x.message) || x) }));
  else if (m.op === "compilar") compilar(m).catch((x) => enviar({ ev: "falha", id: m.id, msg: String((x && x.stack) || x) }));
  else if (m.op === "rodar") rodar(m);
};
// Environment.Exit dentro de um callback assíncrono (depois de um await) chega aqui
function morte(r) {
  const so = estouroDePilha(erroNativo, inicio);
  if (so) { enviar({ ev: "saida", fd: 2, s: so }); enviar({ ev: "fim", exit: 134 }); return true; }
  if (r && typeof r.status === "number") { enviar({ ev: "fim", exit: r.status }); return true; }
  return false;
}
self.addEventListener("unhandledrejection", (e) => { if (morte(e.reason)) e.preventDefault(); });
self.addEventListener("error", (e) => { if (morte(e.error)) e.preventDefault(); });
