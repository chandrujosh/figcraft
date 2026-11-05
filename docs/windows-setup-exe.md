# Building the FigCraft Windows Setup.exe

The Windows release package now includes `figcraft-<version>-windows-x64-setup.exe`.
It is a self-extracting NSIS bootstrapper containing the project's existing WiX MSI. Running the
EXE launches the MSI's normal interactive wizard. The MSI remains responsible for installation,
upgrade, shortcuts, file associations, and uninstall, so the Setup.exe wrapper does not introduce a
second installer database or change the existing install contract.

## Build locally on Windows 10/11 x64

Prerequisites:

- Visual Studio Build Tools with **Desktop development with C++** and a Windows SDK.
- Rust stable with the `x86_64-pc-windows-msvc` target.
- .NET SDK.
- NSIS 3.x, with `makensis.exe` on `PATH` (the package script also checks the usual Program Files
  installation directory).

From the repository root in PowerShell:

```powershell
dotnet tool install --global wix --version 5.0.2
wix extension add -g WixToolset.UI.wixext/5.0.2
wix extension add -g WixToolset.Util.wixext/5.0.2

# Install NSIS if it is not already installed and available on PATH.
choco install nsis -y

# Once the prerequisites above are installed, this builds the EXE and related packages:
.\build-windows-setup.ps1
```

The helper checks for the Rust, WiX, .NET and NSIS commands and installs the selected Rust target
when needed. Outputs are written to `dist/release/`:

- `figcraft-<version>-windows-x64-setup.exe` — the requested setup executable.
- `figcraft-<version>-windows-x64.msi` — the underlying Windows Installer package.
- `figcraft-<version>-windows-x64-portable.zip` — portable build.

## Build with GitHub Actions

Push this repository to GitHub, open **Actions → Build Windows Setup EXE → Run workflow**, and
wait for the `FigCraft-Windows-Setup-x64` artifact. Download the artifact ZIP and extract the
`*-setup.exe` file.

## Signing

The project signing script signs the MSI and Setup.exe when the existing Windows signing secrets are
configured. Without signing credentials, the outputs are unsigned and Windows SmartScreen may show
an unknown-publisher warning. Do not bypass security warnings unless you trust the source and have
verified the release artifact.

## Important

Build the installer on a Windows runner. The repository's native Windows packaging script validates
PE architecture and GUI subsystem before creating the MSI, and those checks cannot be reproduced by
this Linux development environment. The Setup.exe created by NSIS is a bootstrapper; the installed
application itself remains the native `figcraft.exe`.
