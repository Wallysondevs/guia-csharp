/* Compila e roda com o dotnet NATIVO do laboratório (~/guia-csharp-lab/lab: Ubuntu 26.04, .NET SDK 10.0.112)
   para comparar com o editor (Roslyn + .NET em WebAssembly). Um processo por vez, timeout 120 s; o programa
   tem 10 s (timeout). Pasta pessoal própria e única por execução (vários autores rodam ao mesmo tempo),
   apagada quando o processo termina. Os pacotes NuGet do primeiro uso (PublishAot dos file-based apps) vêm
   de uma semente (hardlinks), para não baixar de novo a cada vez. */
"use strict";
const { spawnSync } = require("child_process");
const os = require("os");
const path = require("path");
const fs = require("fs");
const Sim = require("../assets/csharpsim.js");

const PLAB = path.join(os.homedir(), "guia-csharp-lab");
const LAB = path.join(PLAB, "lab");
const SEMENTE = path.join(os.homedir(), "rascunho/cs-sim/semente-nuget/packages");
const NOME = "tm-cs-" + process.pid + "-" + Math.random().toString(36).slice(2, 8);
const PASTA = path.join(PLAB, "homes", NOME);
let usada = false;
process.on("exit", () => { if (usada) { try { fs.rmSync(PASTA, { recursive: true, force: true }); } catch (e) { /* ok */ } } });
for (const sinal of ["SIGINT", "SIGTERM"]) process.on(sinal, () => process.exit(130));

function b64(s) { return Buffer.from(s, "utf8").toString("base64"); }
function q(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }

function preparar() {
  if (usada) return;
  usada = true;
  fs.rmSync(PASTA, { recursive: true, force: true });
  spawnSync("cp", ["-a", "--sparse=always", path.join(PLAB, "template"), PASTA]);
  if (fs.existsSync(SEMENTE)) { fs.mkdirSync(path.join(PASTA, ".nuget"), { recursive: true }); spawnSync("cp", ["-al", SEMENTE, path.join(PASTA, ".nuget/packages")]); }
}

const CSPROJ = '<Project Sdk="Microsoft.NET.Sdk">\n\n  <PropertyGroup>\n    <OutputType>Exe</OutputType>\n    <TargetFramework>net10.0</TargetFramework>\n    <ImplicitUsings>enable</ImplicitUsings>\n    <Nullable>enable</Nullable>\n  </PropertyGroup>\n\n</Project>\n';

/** arquivos: [{nome, codigo}]; opts: {args: [...], stdin: string|null}
 *  → { compilou, diag (linhas do compilador), saida (do programa), saidaTotal (tudo, como no terminal), exit, versao, comando } */
function rodar(arquivos, opts) {
  opts = opts || {};
  if (!fs.existsSync(LAB)) throw new Error("laboratório não encontrado em " + LAB);
  preparar();
  const o = Sim.onde(arquivos);
  const dir = o.projeto ? "projetos/" + o.projeto : "cs";
  const entrada = opts.stdin !== null && opts.stdin !== undefined ? "printf %s " + q(b64(opts.stdin)) + " | base64 -d > /tmp/entrada.txt" : ": > /tmp/entrada.txt";
  const principal = (arquivos.find((a) => Sim.ehFonte(a.nome)) || arquivos[0]).nome;
  const cmd = o.projeto ? "dotnet run" : "dotnet run " + q(principal);
  const script = [
    "cd /home/ana && rm -rf cs projetos && mkdir -p " + dir + " && cd " + dir,
    arquivos.map((a) => 'mkdir -p "$(dirname ' + q(a.nome) + ')" && printf %s ' + q(b64(a.codigo)) + " | base64 -d > " + q(a.nome)).join("\n"),
    o.projeto ? "printf %s " + q(b64(CSPROJ)) + " | base64 -d > " + q(o.projeto + ".csproj") : ":",
    entrada,
    "echo @@INI@@",
    "timeout 100 " + cmd + ((opts.args || []).length ? " -- " + opts.args.map(q).join(" ") : "") + " < /tmp/entrada.txt 2>&1 | grep -v '^timeout: o comando monitorado'; echo \"@@EXIT@@${PIPESTATUS[0]}\"",
    "dotnet --version",
  ].join("\n");
  const r = spawnSync("timeout", ["120", LAB, "-n", NOME, "--", "bash", "-s"], { input: script, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (r.error) throw r.error;
  const s = r.stdout + (r.stderr || "");
  const m = /@@INI@@\n([\s\S]*?)@@EXIT@@(\d+)\n([^\n]*)/.exec(s);
  if (!m) return { compilou: false, diag: s, saida: "", saidaTotal: s, exit: null, versao: "?", comando: cmd };
  const total = m[1], exit = +m[2];
  const falhou = /^Ocorreu uma falha no build\./m.test(total) || /^The build failed\./m.test(total);
  // o começo é do compilador (avisos/erros); o resto, do programa
  const linhas = total.split("\n"), diag = [];
  let i = 0;
  while (i < linhas.length && (/^(?:.*?\(\d+,\d+\): |CSC : )?(error|warning) [A-Z]+\d+: /.test(linhas[i]) || (falhou && (linhas[i] === "" || /^Ocorreu uma falha no build/.test(linhas[i]))))) diag.push(linhas[i++]);
  const saida = falhou ? "" : linhas.slice(i).join("\n");
  return { compilou: !falhou, diag: diag.join("\n") + (diag.length ? "\n" : ""), saida, saidaTotal: total, exit: falhou ? null : exit, exitTotal: exit, versao: (m[3] || "?").trim(), comando: cmd };
}

// Diferenças linha a linha (LCS simples).  "- " = editor, "+ " = dotnet do laboratório
function diferencas(a, b) {
  if (String(a) === String(b)) return [];
  const linhas = (s) => { s = String(s).replace(/\n$/, ""); return s === "" ? [] : s.split("\n").slice(0, 600); };
  const A = linhas(a), B = linhas(b);
  const n = A.length, m = B.length, L = [];
  for (let i = 0; i <= n; i++) L.push(new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const r = []; let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { i++; j++; }
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { r.push("+ " + B[j]); j++; }
    else { r.push("- " + A[i]); i++; }
  }
  return r;
}

// Diferenças conhecidas entre o editor e o dotnet do laboratório (ver CONTRIBUINDO §4).
function classificar(dif, fonte) {
  const r = new Set();
  if (dif.some((l) => /warning IL\d+|warning CA\d+/.test(l))) r.add("avisos IL/CA dos analisadores do SDK (o editor não roda analisadores)");
  if (fonte && /\bRandom\b|Guid\.NewGuid|GetHashCode/.test(fonte)) r.add("números sorteados / hash (mudam a cada execução)");
  if (fonte && /DateTime\.(Now|Today|UtcNow)|DateOnly\.FromDateTime|Stopwatch|TimeProvider|Environment\.TickCount/.test(fonte)) r.add("data, hora e tempo medido");
  if (fonte && /Environment\.(ProcessorCount|OSVersion|MachineName|ProcessId|CurrentManagedThreadId)|RuntimeInformation|Environment\.Version/.test(fonte)) r.add("informações da máquina/do runtime (WebAssembly × Linux)");
  if (dif.some((l) => /   at /.test(l))) r.add("linhas da pilha da exceção");
  return Array.from(r);
}

/** compara a execução do editor (r, de cs-node.js) com a do lab (n); imprime e devolve o nº de diferenças */
function mostrarDiferencas(r, n, prefixo, fonte) {
  prefixo = prefixo || "  ";
  const partes = [];
  if (r.compilou !== n.compilou) partes.push("no laboratório " + (n.compilou ? "COMPILA" : "NÃO compila") + "; no editor " + (r.compilou ? "compila" : "não compila"));
  const dd = diferencas(r.diagTexto || "", n.diag || "");
  if (dd.length) partes.push("mensagens do compilador (- editor, + lab):\n" + dd.slice(0, 12).map((l) => prefixo + "    " + l).join("\n"));
  if (r.compilou && n.compilou) {
    if (r.exit !== n.exit) partes.push("código de saída: editor " + r.exit + " × lab " + n.exit);
    const d = diferencas(r.saida, n.saida);
    if (d.length) partes.push("saída (- editor, + lab):\n" + d.slice(0, 20).map((l) => prefixo + "    " + l).join("\n"));
  }
  const c = classificar(dd.concat(diferencas(r.saida || "", n.saida || "")), fonte);
  if (!partes.length) { console.log(prefixo + "editor e laboratório: iguais"); return 0; }
  console.log(prefixo + "diferenças" + (c.length ? " — esperado: " + c.join("; ") : "") + ":");
  partes.forEach((p) => console.log(prefixo + "· " + p));
  return partes.length;
}

module.exports = { rodar, diferencas, classificar, mostrarDiferencas, LAB };
