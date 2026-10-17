/* cs-comum.mjs — partes do motor C# usadas no navegador (assets/cs/cs-worker.js) e no Node
   (tools/cs-node.js): leitura dos pacotes e o carregador de recursos do runtime .NET (dotnet.js).

   Pacote (.pak, guardado comprimido com gzip: .pak.gz):
     u32 n, depois n × (u16 tamanho do nome, nome UTF-8, u32 tamanho, bytes)   (little-endian) */

// o Mono escreve avisos internos "[MONO] …" direto no console: some com eles
for (const k of ["log", "error", "warn", "info", "debug"]) {
  const orig = console[k];
  if (orig && !orig.__semMono) { const f = function (a, ...r) { if (typeof a === "string" && a.startsWith("[MONO]")) return; return orig.call(console, a, ...r); }; f.__semMono = true; console[k] = f; }
}

export function lerPacote(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const dec = new TextDecoder();
  const mapa = new Map();
  let p = 0;
  const n = dv.getUint32(p, true); p += 4;
  for (let i = 0; i < n; i++) {
    const tn = dv.getUint16(p, true); p += 2;
    const nome = dec.decode(u8.subarray(p, p + tn)); p += tn;
    const t = dv.getUint32(p, true); p += 4;
    mapa.set(nome, u8.subarray(p, p + t)); p += t;
  }
  return mapa;
}

// para o dotnet.withResourceLoader: tudo que está no pacote vem da memória (sem baixar arquivo por arquivo)
export function carregadorDe(mapa) {
  return function (tipo, nome) {
    if (/^js-module|^dotnetjs$/.test(tipo)) return undefined;
    const b = mapa.get(nome) || mapa.get(String(nome).replace(/^.*\//, ""));
    if (!b) return undefined;
    const tipoMime = /\.wasm$/.test(nome) && tipo === "dotnetwasm" ? "application/wasm" : "application/octet-stream";
    return Promise.resolve(new Response(b.slice(), { headers: { "content-type": tipoMime } }));
  };
}

// a configuração comum do runtime: cultura pt-BR, fuso de São Paulo, como a máquina da Ana
// opcoes.erroNativo(texto): o que o runtime escreve sozinho no stderr (ex.: estouro de pilha)
// opcoes.depurar: liga a leitura dos PDB (só no executor: o compilador fica mais lento com ela)
export function configurar(dotnet, mapa, opcoes) {
  opcoes = opcoes || {};
  return dotnet
    // o que o runtime escreve sozinho (o Console do programa vai por outro caminho); "[MONO] …" é diagnóstico interno
    .withModuleConfig({
      print: (t) => { if (!/^\[MONO\]/.test(String(t))) console.log(t); },
      printErr: (t) => { if (opcoes.erroNativo) opcoes.erroNativo(String(t) + "\n"); else if (!/^\[MONO\]/.test(String(t))) console.error(t); },
    })
    .withApplicationCulture("pt-BR")
    .withEnvironmentVariable("TZ", "America/Sao_Paulo")
    .withEnvironmentVariable("LANG", "pt_BR.UTF-8")
    .withEnvironmentVariable("HOME", "/home/ana")
    .withEnvironmentVariable("USER", "ana")
    // executor: depuração ligada (sem depurador): o Mono lê o PDB do programa e as exceções ganham
    // "in arquivo:line N" (o dotnet.js foi ajustado por empacotar-cs.mjs para aceitar isso fora do Chrome/Firefox)
    .withDebugging(opcoes.depurar ? -1 : 0)
    .withConfig(opcoes.depurar ? { resources: { pdb: [{ name: "Motor.pdb", virtualPath: "Motor.pdb" }] } } : {})
    .withResourceLoader(carregadorDe(mapa))
    .withConfig(globalThis.location && /dbg=1/.test(globalThis.location.search) ? { diagnosticTracing: true } : {});
}

const TIPOS_MONO = { string: "System.String", int: "System.Int32", long: "System.Int64", bool: "System.Boolean", double: "System.Double", single: "System.Single", float: "System.Single", decimal: "System.Decimal", char: "System.Char", object: "System.Object", byte: "System.Byte", sbyte: "System.SByte", short: "System.Int16", ushort: "System.UInt16", uint: "System.UInt32", ulong: "System.UInt64", intptr: "System.IntPtr" };
function tipoClr(t) {
  t = t.trim();
  const m = /^([^\[]+)((?:\[\])*)$/.exec(t);
  return m && TIPOS_MONO[m[1]] ? TIPOS_MONO[m[1]] + m[2] : t;
}
/* O Mono (WebAssembly) avisa um estouro de pilha com "FATAL UNHANDLED EXCEPTION: System.StackOverflowException …"
   e uma linha "at Tipo.Metodo (string) [0x00008] in <…>:0" por quadro. O .NET do Linux escreve
       Stack overflow.
       Repeated 261755 times:
       --------------------------------
          at Pessoa.set_Nome(System.String)
       --------------------------------
          at Program.<Main>$(System.String[])
   e sai com 134. Devolve esse texto (o número de repetições é o do WebAssembly), ou null. */
export function estouroDePilha(stderr, inicio) {
  if (!/StackOverflowException/.test(stderr || "")) return null;
  const quadros = [];
  for (const l of String(stderr).split("\n")) {
    const m = /^\s*at (?:\(wrapper [^)]*\) )?([^\s(]+) \(([^)]*)\)/.exec(l);
    if (!m) continue;
    if (/^(Motor\.|System\.Reflection\.|System\.Runtime\.|System\.Threading\.Tasks\.|System\.RuntimeMethodHandle)/.test(m[1])) continue;
    quadros.push("   at " + m[1] + "(" + (m[2].trim() ? m[2].split(",").map(tipoClr).join(", ") : "") + ")");
  }
  const r = ["Stack overflow."];
  let i = 0;
  while (i < quadros.length) {
    let j = i; while (j < quadros.length && quadros[j] === quadros[i]) j++;
    if (j - i > 1) r.push("Repeated " + (j - i) + " times:", "--------------------------------", quadros[i], "--------------------------------");
    else r.push(quadros[i]);
    i = j;
  }
  if (inicio && quadros.length >= 999 && quadros[quadros.length - 1] !== "   at " + inicio) r.push("   at " + inicio);
  return r.join("\n") + "\n";
}
