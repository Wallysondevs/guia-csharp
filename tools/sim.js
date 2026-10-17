#!/usr/bin/env node
/* Compila e roda um .cs como o "Experimente" do guia faria: o MESMO motor de assets/cs/
   (o Roslyn do laboratório, C# 14, e o runtime .NET 10 em WebAssembly). Não precisa de npm install.

   node tools/sim.js Program.cs [argumentos…]
   node tools/sim.js Program.cs --stdin "Ana\n29" -- arg1 arg2
   node tools/sim.js Program.cs --com Conta.cs --com dados.txt

   --stdin TEXTO   entrada do programa (como data-stdin; \n = Enter). Sem --stdin o programa
                   recebe "fim da entrada" (Console.ReadLine() devolve null) se ler a entrada
                   (no navegador ele esperaria o leitor digitar).
   --com ARQ       outro arquivo da caixa (aba): os .cs são compilados juntos (vira um projeto,
                   como no laboratório); os outros ficam na pasta em que o programa roda.
   --args "…"      os argumentos (como data-args: "Ana 'Maria Clara' 29"); os outros valores que não são
                   arquivo também viram argumentos (como depois de "--").
   --nativo        compila e roda também com o dotnet do laboratório e compara.
*/
"use strict";
const fs = require("fs");
const path = require("path");
const C = require("./cs-node.js");
const Sim = require("../assets/csharpsim.js");

function uso() { console.error(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^[\s\S]*?\n\n/, "")); process.exit(2); }

async function main() {
  const a = process.argv.slice(2);
  if (!a.length || a[0] === "-h" || a[0] === "--help") uso();
  let principal = null, stdin = null, nativo = false;
  const com = [], args = [];
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    if (x === "--") { args.push(...a.slice(i + 1)); break; }
    else if (x === "--stdin") stdin = Sim.textoEntrada(a[++i] || "");
    else if (x === "--com") com.push(a[++i]);
    else if (x === "--args") args.push(...Sim.dividirArgs(a[++i] || ""));
    else if (x === "--nativo") nativo = true;
    else if (!principal && (/\.cs$/i.test(x) || fs.existsSync(x))) principal = x;
    else args.push(x);
  }
  if (!principal) uso();
  const arquivos = [principal].concat(com).map((f) => ({ nome: path.basename(f), codigo: fs.readFileSync(f, "utf8") }));
  const cor = process.stdout.isTTY;
  const r = await C.executar(arquivos, { args, stdin });
  const o = Sim.onde(arquivos);
  console.log((cor ? "\x1b[2m" : "") + "(" + o.til + ")" + (cor ? "\x1b[0m" : "") + " $ " + Sim.linhaComando(arquivos, args));
  if (r.diagTexto) process.stdout.write(r.diagTexto);
  if (r.compilou) {
    for (const e of r.eventos) process.stdout.write(e.t === "err" && cor ? "\x1b[31m" + e.s + "\x1b[0m" : e.s);
    if (r.saida && !/\n$/.test(r.saida)) process.stdout.write("\n");
    if (r.estourou) console.log("(o programa escreveu mais de 2 MB; o editor o interromperia)");
    if (r.tempoEsgotado) console.log("(o programa rodou mais de " + C.TEMPO_MAX / 1000 + " s; o editor o pararia)");
    if (r.leuSemEntrada) console.log("(o programa leu a entrada sem --stdin: recebeu fim da entrada; no navegador o leitor digitaria)");
    if (r.falha) console.log("(falha interna do motor: " + r.falha.split("\n")[0] + ")");
  }
  console.log("[código de saída: " + (r.compilou ? r.exit : 1) + "]" + (cor ? "\x1b[2m" : "") + "  (compilou em " + r.msCompilacao + " ms)" + (cor ? "\x1b[0m" : ""));
  if (nativo) {
    const Lab = require("./lab-nativo.js");
    const n = Lab.rodar(arquivos, { args, stdin });
    console.log("\n== dotnet " + n.versao + " do laboratório (" + n.comando + ")");
    process.stdout.write(n.saidaTotal);
    if (!/\n$/.test(n.saidaTotal) && n.saidaTotal) process.stdout.write("\n");
    console.log("[código de saída: " + n.exit + "]");
    Lab.mostrarDiferencas(r, n, "  ", arquivos.map((x) => x.codigo).join("\n"));
  }
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
