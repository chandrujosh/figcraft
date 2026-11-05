; FigCraft Windows Setup.exe bootstrapper.
; Embeds the existing WiX MSI and presents its regular interactive installer UI.
; The MSI remains authoritative for installation, upgrades, shortcuts and uninstall.

Unicode true
!include "LogicLib.nsh"

!ifndef MSI_PATH
  !error "MSI_PATH is required (path to the built FigCraft MSI)"
!endif
!ifndef OUTFILE
  !error "OUTFILE is required (path to the generated Setup.exe)"
!endif
!ifndef APP_ICON
  !error "APP_ICON is required (path to FigCraft's .ico file)"
!endif
!ifndef NUMERIC_VERSION
  !define NUMERIC_VERSION "0.0.0"
!endif

Name "FigCraft Setup"
Caption "FigCraft Setup"
OutFile "${OUTFILE}"
Icon "${APP_ICON}"
RequestExecutionLevel user
SilentInstall silent
SilentUnInstall silent
SetCompressor /SOLID lzma

VIProductVersion "${NUMERIC_VERSION}.0"
VIAddVersionKey "ProductName" "FigCraft"
VIAddVersionKey "FileDescription" "FigCraft Windows Installer"
VIAddVersionKey "CompanyName" "Learning Machines LLC"
VIAddVersionKey "ProductVersion" "${NUMERIC_VERSION}"
VIAddVersionKey "FileVersion" "${NUMERIC_VERSION}"
VIAddVersionKey "LegalCopyright" "Copyright Learning Machines LLC"

Section "Install FigCraft"
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File /oname=FigCraft.msi "${MSI_PATH}"

  ; Preserve the MSI's full user interface, including install-folder selection and launch option.
  ; The verbose log is intentionally retained in %TEMP% for troubleshooting failed installs.
  ExecWait '"$SYSDIR\\msiexec.exe" /i "$PLUGINSDIR\\FigCraft.msi" /l*v "$TEMP\\FigCraft-install.log"' $0

  ; Windows Installer success and reboot-required exit codes.
  ${If} $0 == 0
  ${OrIf} $0 == 1641
  ${OrIf} $0 == 3010
    SetErrorLevel $0
  ${Else}
    MessageBox MB_ICONSTOP|MB_OK "FigCraft installation failed (Windows Installer exit code $0). Details: $TEMP\\FigCraft-install.log"
    SetErrorLevel $0
  ${EndIf}
SectionEnd
