!macro customInstall
  ; Patch the official app after the mod files are installed.
  ; PRODUCT_FILENAME is the exe name, equal to productName.
  nsExec::ExecToLog '"$INSTDIR\Yandex Music Custom.exe" --patch'
!macroend

!macro customRemoveFiles
  ; Restore the original app before deleting our own files.
  ; customRemoveFiles runs before NSIS removes files, so the exe still exists.
  nsExec::ExecToLog '"$INSTDIR\Yandex Music Custom.exe" --unpatch'
  RMDir /r $INSTDIR
!macroend
