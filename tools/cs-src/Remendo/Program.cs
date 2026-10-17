// Remendo: copia os assemblies do Roslyn do laboratório tirando o código nativo ReadyToRun (fica só o IL,
// que é o que o runtime WebAssembly usa) e troca, no construtor de Microsoft.Cci.DebugSourceDocument,
//     _sourceInfo = Task.Run(sourceInfo);
// por
//     _sourceInfo = Task.FromResult(sourceInfo());
// No WebAssembly de uma thread só, o Task.Run nunca roda enquanto o Emit espera o resultado
// ("Cannot wait on monitors on this runtime") ao gravar o PDB (que dá as linhas nas exceções).
// Também (com --console SYSTEM_CONSOLE_DLL): troca no System.Console.dll do .NET para navegador o corpo dos
// métodos de System.ConsolePal que lançam PlatformNotSupportedException por chamadas a Motor.ConsoleNavegador
// (tools/cs-src/Motor/ConsoleNavegador.cs): cores (ANSI), janela 80×24, ReadKey…
// Uso: Remendo PASTA_ORIGEM PASTA_DESTINO [--console SYSTEM_CONSOLE_DLL]
using Mono.Cecil;
using Mono.Cecil.Cil;

string de = args[0], para = args[1];
if (args.Length >= 4 && args[2] == "--console") RemendarConsole(args[3], Path.Combine(para, "console", "System.Console.dll"));
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

static void RemendarConsole(string origem, string destino)
{
    string[] nomes = ["get_InputEncoding", "SetConsoleInputEncoding", "get_TreatControlCAsInput", "set_TreatControlCAsInput",
        "get_ForegroundColor", "set_ForegroundColor", "get_BackgroundColor", "set_BackgroundColor", "ResetColor",
        "get_CursorSize", "set_CursorSize", "get_CursorVisible", "set_CursorVisible", "GetCursorPosition", "get_Title", "set_Title",
        "Beep", "SetCursorPosition", "get_BufferWidth", "set_BufferWidth", "get_BufferHeight", "set_BufferHeight", "SetBufferSize",
        "get_LargestWindowWidth", "get_LargestWindowHeight", "set_WindowLeft", "set_WindowTop", "get_WindowWidth", "set_WindowWidth",
        "get_WindowHeight", "set_WindowHeight", "SetWindowPosition", "SetWindowSize", "ReadKey"];
    Directory.CreateDirectory(Path.GetDirectoryName(destino)!);
    var asm = AssemblyDefinition.ReadAssembly(origem);
    var mod = asm.MainModule;
    var motor = new AssemblyNameReference("Motor", new Version(1, 0, 0, 0));
    mod.AssemblyReferences.Add(motor);
    var ajudante = new TypeReference("Motor", "ConsoleNavegador", mod, motor);
    var pal = mod.GetType("System.ConsolePal") ?? throw new Exception("System.ConsolePal não encontrado");
    int n = 0;
    foreach (var m in pal.Methods.Where(m => nomes.Contains(m.Name) && m.HasBody))
    {
        var alvo = new MethodReference(m.Name, m.ReturnType, ajudante) { HasThis = false };
        foreach (var p in m.Parameters) alvo.Parameters.Add(new ParameterDefinition(p.ParameterType));
        m.Body.Instructions.Clear();
        m.Body.ExceptionHandlers.Clear();
        m.Body.Variables.Clear();
        var il = m.Body.GetILProcessor();
        for (int i = 0; i < m.Parameters.Count; i++) il.Append(il.Create(OpCodes.Ldarg, m.Parameters[i]));
        il.Append(il.Create(OpCodes.Call, mod.ImportReference(alvo)));
        il.Append(il.Create(OpCodes.Ret));
        n++;
    }
    asm.Write(destino);
    Console.WriteLine($"System.Console.dll: {n} métodos do ConsolePal trocados");
}
