using System.Text.Json;
using PjskBundle2Parts.Services;

if (args.Length != 3) throw new ArgumentException("Expected master-directory, asset-markers, output.json");
var result = CostumeRegistryExporter.ExportInMemory(args[0], args[1]);
File.WriteAllText(args[2], JsonSerializer.Serialize(new {
    entries = result.PartRegistry.Entries,
    compatibility = result.HeadHairCompatibility,
    roles = RuntimeRoleCatalogExporter.WriteFromMaster(args[0], Path.Combine(Path.GetDirectoryName(args[2])!, "role-metadata")).Roles,
}));
