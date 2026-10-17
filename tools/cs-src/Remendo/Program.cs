// Remendo: copia os assemblies do Roslyn do laboratório tirando o código nativo ReadyToRun (fica só o IL,
// que é o que o runtime WebAssembly usa) e troca, no construtor de Microsoft.Cci.DebugSourceDocument,
//     _sourceInfo = Task.Run(sourceInfo);
// por
//     _sourceInfo = Task.FromResult(sourceInfo());
// No WebAssembly de uma thread só, o Task.Run nunca roda enquanto o Emit espera o resultado
// ("Cannot wait on monitors on this runtime") ao gravar o PDB (que dá as linhas nas exceções).
// Uso: Remendo PASTA_ORIGEM PASTA_DESTINO
using Mono.Cecil;
using Mono.Cecil.Cil;

string de = args[0], para = args[1];
Directory.CreateDirectory(para);
var resolver = new DefaultAssemblyResolver();
resolver.AddSearchDirectory(de);
foreach (var nome in new[] { "Microsoft.CodeAnalysis.dll", "Microsoft.CodeAnalysis.CSharp.dll" })
{
    var asm = AssemblyDefinition.ReadAssembly(Path.Combine(de, nome), new ReaderParameters { AssemblyResolver = resolver, ReadSymbols = false });
    int trocas = 0;
    if (nome == "Microsoft.CodeAnalysis.dll")
    {
        var tipo = asm.MainModule.GetType("Microsoft.Cci.DebugSourceDocument") ?? throw new Exception("DebugSourceDocument não encontrado");
        foreach (var ctor in tipo.Methods.Where(m => m.IsConstructor))
        {
            var il = ctor.Body.GetILProcessor();
            foreach (var ins in ctor.Body.Instructions.ToList())
            {
                if (ins.OpCode == OpCodes.Call && ins.Operand is GenericInstanceMethod gm && gm.Name == "Run" && gm.DeclaringType.FullName == "System.Threading.Tasks.Task")
                {
                    var t = gm.GenericArguments[0];
                    var funcAberto = asm.MainModule.ImportReference(typeof(Func<>));
                    var func = new GenericInstanceType(funcAberto); func.GenericArguments.Add(t);
                    var invoke = new MethodReference("Invoke", funcAberto.GenericParameters[0], func) { HasThis = true };
                    invoke = asm.MainModule.ImportReference(invoke);
                    var fromAberto = asm.MainModule.ImportReference(typeof(Task).GetMethod("FromResult")!);
                    var from = new GenericInstanceMethod(fromAberto); from.GenericArguments.Add(t);
                    il.InsertBefore(ins, il.Create(OpCodes.Callvirt, invoke));
                    ins.Operand = asm.MainModule.ImportReference(from);
                    trocas++;
                }
            }
        }
        if (trocas == 0) throw new Exception("não achei o Task.Run no DebugSourceDocument");
    }
    // sem ReadyToRun: só IL
    asm.MainModule.Attributes &= ~ModuleAttributes.ILLibrary;
    asm.MainModule.Attributes |= ModuleAttributes.ILOnly;
    asm.Write(Path.Combine(para, nome));
    Console.WriteLine($"{nome}: {trocas} troca(s), {new FileInfo(Path.Combine(para, nome)).Length / 1024} KB");
}
foreach (var sat in Directory.GetFiles(Path.Combine(de, "pt-BR"), "Microsoft.CodeAnalysis*.resources.dll"))
{
    if (sat.Contains("VisualBasic")) continue;
    Directory.CreateDirectory(Path.Combine(para, "pt-BR"));
    File.Copy(sat, Path.Combine(para, "pt-BR", Path.GetFileName(sat)), true);
}
