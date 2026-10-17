/* O motor do editor do Guia C# no Node (para tools/sim.js e tools/testar-missoes.js): os MESMOS arquivos de
   assets/cs/ que o navegador baixa — o Roslyn do laboratório (C# 14) e o runtime .NET 10 em WebAssembly.
   O compilador fica carregado; cada programa roda num runtime novo (worker_thread), como no navegador.

   const C = require("./cs-node.js");
   const r = await C.executar([{nome: "Program.cs", codigo}], {args: [], stdin: null|"texto", projeto: null|"Exemplo"});
   → { compilou, diagTexto, diags, msCompilacao, saida, eventos:[{t:"out"|"err", s}], exit, tempoEsgotado, estourou, leuSemEntrada } */
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { Worker } = require("worker_threads");

const PASTA = path.join(__dirname, "..", "assets", "cs");
const TEMPO_MAX = 10000;   // ms (o navegador para o programa em 15 s)
const SAIDA_MAX = 2e6;     // caracteres de saída

let motor = null;          // Promise do compilador
let pacoteSab = null;      // o pacote do runtime (descomprimido) para os workers

function versao() { try { return JSON.parse(fs.readFileSync(path.join(PASTA, "manifesto.json"), "utf8")); } catch (e) { return null; } }

function lerGz(nome) { return zlib.gunzipSync(fs.readFileSync(path.join(PASTA, nome))); }

function carregar() {
  if (motor) return motor;
  motor = (async () => {
    const comum = await import(path.join(PASTA, "cs-comum.mjs"));
    const bruto = lerGz("motor.pak.gz");
    pacoteSab = new SharedArrayBuffer(bruto.length);
    new Uint8Array(pacoteSab).set(bruto);
    const mapa = comum.lerPacote(new Uint8Array(pacoteSab));
    const { dotnet } = await import(path.join(PASTA, "dotnet.js"));
    const rt = await comum.configurar(dotnet, mapa).create();
    rt.setModuleImports("motor", { escrever() {}, lerEntrada() { return ""; }, pedirEntrada() {}, inicio() {} });
    const ex = (await rt.getAssemblyExports("Motor.dll")).Motor;
    ex.Compilador.CarregarReferencias(new Uint8Array(lerGz("refs.pak.gz")));
    return ex;
  })();
  return motor;
}

function ehFonte(nome) { return /\.cs$/i.test(nome); }
function nomePrograma(arquivos) {
  const f = arquivos.find((a) => ehFonte(a.nome)) || arquivos[0];
  return (String(f ? f.nome : "Program.cs").replace(/^.*\//, "").replace(/\.[^.]*$/, "") || "Program");
}
// pasta e projeto como no laboratório: arquivo único → /home/ana/cs (dotnet run arquivo.cs);
// vários .cs → um projeto em /home/ana/projetos/NOME (dotnet run)
function onde(arquivos, opts) {
  const fontes = arquivos.filter((a) => ehFonte(a.nome));
  const projeto = opts.projeto || (fontes.length > 1 ? "Exemplo" : null);
  return { projeto, pasta: projeto ? "/home/ana/projetos/" + projeto : "/home/ana/cs", nome: projeto || nomePrograma(arquivos) };
}

async function compilar(arquivos, opts) {
  opts = opts || {};
  const ex = await carregar();
  const o = onde(arquivos, opts);
  const r = JSON.parse(await ex.Compilador.Compilar(JSON.stringify({ arquivos, pasta: o.pasta, projeto: o.projeto, nome: o.nome })));
  r.onde = o;
  if (r.ok) { r.dll = ex.Compilador.Dll().slice(); r.pdb = ex.Compilador.Pdb().slice(); }
  return r;
}

function rodar(c, arquivos, opts) {
  opts = opts || {};
  return new Promise((ok) => {
    const dados = arquivos.filter((a) => !ehFonte(a.nome));
    const w = new Worker(path.join(__dirname, "cs-executor-node.mjs"), {
      workerData: { pacote: pacoteSab, pasta: PASTA, dll: c.dll, pdb: c.pdb, args: opts.args || [], dir: c.onde.pasta,
        nomes: dados.map((a) => a.nome), conteudos: dados.map((a) => a.codigo), stdin: opts.stdin === undefined ? null : opts.stdin,
        arquivoUnico: c.onde.projeto ? "" : c.onde.pasta + "/" + (arquivos.find((a) => ehFonte(a.nome)) || arquivos[0]).nome },
      stdout: true, stderr: true,
    });
    const r = { saida: "", eventos: [], exit: null, tempoEsgotado: false, estourou: false, leuSemEntrada: false };
    let fim = false;
    const terminar = () => { if (fim) return; fim = true; clearTimeout(relogio); ok(r); };
    const relogio = setTimeout(() => { r.tempoEsgotado = true; w.terminate(); }, opts.tempo || TEMPO_MAX);
    w.on("message", (m) => {
      if (m.ev === "saida") {
        const t = m.fd === 2 ? "err" : "out";
        r.saida += m.s;
        const u = r.eventos[r.eventos.length - 1];
        if (u && u.t === t) u.s += m.s; else r.eventos.push({ t, s: m.s });
        if (r.saida.length > SAIDA_MAX) { r.estourou = true; w.terminate(); }
      } else if (m.ev === "leu") r.leuSemEntrada = true;
      else if (m.ev === "fim") { r.exit = m.exit; }
      else if (m.ev === "falha") { r.falha = m.msg; }
    });
    w.stdout.on("data", () => {}); w.stderr.on("data", (d) => { r.erroInterno = (r.erroInterno || "") + d; });
    w.on("error", (e) => { r.falha = String(e && e.stack || e); });
    w.on("exit", (code) => {
      if (r.exit === null && !r.tempoEsgotado && !r.estourou) r.exit = code; // Environment.Exit(n)
      // cores do Console (ANSI) ficam em r.eventos; a saída das metas e da comparação é o texto sem elas
      r.saida = r.saida.replace(/\x1b\[[0-9;]*m/g, "");
      terminar();
    });
  });
}

/** compila e roda, como a caixa do navegador */
async function executar(arquivos, opts) {
  opts = opts || {};
  const t0 = Date.now();
  const c = await compilar(arquivos, opts);
  const base = { compilou: c.ok, diagTexto: c.texto, diags: c.diags, msCompilacao: c.ms, msTotalCompilacao: Date.now() - t0, onde: c.onde, saida: "", eventos: [], exit: null };
  if (!c.ok) return Object.assign(base, { exitCompilacao: 1 });
  const r = await rodar(c, arquivos, opts);
  return Object.assign(base, r);
}

function linhaComando(arquivos, opts) {
  const o = onde(arquivos, opts || {});
  const principal = (arquivos.find((a) => ehFonte(a.nome)) || arquivos[0] || { nome: "Program.cs" }).nome;
  return o.projeto ? "dotnet run" : "dotnet run " + principal;
}

function encerrar() { /* o compilador mora nesta thread; process.exit encerra */ }

module.exports = { executar, compilar, rodar, carregar, versao, encerrar, onde, linhaComando, TEMPO_MAX, SAIDA_MAX };
