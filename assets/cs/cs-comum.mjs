/* cs-comum.mjs — partes do motor C# usadas no navegador (assets/cs/cs-worker.js) e no Node
   (tools/cs-node.js): leitura dos pacotes e o carregador de recursos do runtime .NET (dotnet.js).

   Pacote (.pak, guardado comprimido com gzip: .pak.gz):
     u32 n, depois n × (u16 tamanho do nome, nome UTF-8, u32 tamanho, bytes)   (little-endian) */

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
export function configurar(dotnet, mapa) {
  return dotnet
    .withApplicationCulture("pt-BR")
    .withEnvironmentVariable("TZ", "America/Sao_Paulo")
    .withEnvironmentVariable("LANG", "pt_BR.UTF-8")
    .withEnvironmentVariable("HOME", "/home/ana")
    .withEnvironmentVariable("USER", "ana")
    .withResourceLoader(carregadorDe(mapa));
}
