@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title Archie File Agent

set "CURRENT_URL=http://localhost:11434"
set "CURRENT_MODEL=qwen3-coder:480b-cloud"
set "CURRENT_BASEDIR=./sandbox"
set "CURRENT_EXTRADIR="

:load_env
if exist .env (
    for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
        if "%%a"=="OLLAMA_BASE_URL" set "CURRENT_URL=%%b"
        if "%%a"=="OLLAMA_MODEL" set "CURRENT_MODEL=%%b"
        if "%%a"=="ARCHIE_BASE_DIR" set "CURRENT_BASEDIR=%%b"
        if "%%a"=="EXTRA_READ_DIR" set "CURRENT_EXTRADIR=%%b"
    )
)

:menu
cls
color 0B
echo.
echo    █████╗ ██████╗  ██████╗██╗  ██╗██╗███████╗
echo   ██╔══██╗██╔══██╗██╔════╝██║  ██║██║██╔════╝
echo   ███████║██████╔╝██║     ███████║██║█████╗  
echo   ██╔══██║██╔══██╗██║     ██╔══██║██║██╔══╝  
echo   ██║  ██║██║  ██║╚██████╗██║  ██║██║███████╗
echo   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝╚══════╝
echo                                FILE AGENT
echo.
color 0F
echo   Configuracion actual
echo   --------------------
color 07
echo   URL Ollama .... %CURRENT_URL%
echo   Modelo ........ %CURRENT_MODEL%
echo   Dir. Base ..... %CURRENT_BASEDIR%
echo   Dir. Extra .... %CURRENT_EXTRADIR%
echo.
color 0F
echo   Opciones
echo   --------
color 0B
echo   [1] Ollama (iniciar, modelos)
echo   [2] Configurar URL
echo   [3] Directorio base
echo   [4] Directorio extra
echo.
color 0A
echo   [5] Guardar
echo   [6] Iniciar agente
echo.
color 0C
echo   [0] Salir
color 07
echo.
set /p "choice=   Opcion: "

if "%choice%"=="1" goto ollama_menu
if "%choice%"=="2" goto set_url
if "%choice%"=="3" goto set_basedir
if "%choice%"=="4" goto set_extradir
if "%choice%"=="5" goto save
if "%choice%"=="6" goto start_agent
if "%choice%"=="0" exit
goto menu

:ollama_menu
cls
color 0B
echo.
echo   OLLAMA
echo   ------
color 07
echo.
echo   [1] Iniciar Ollama
echo   [2] Listar modelos
echo   [3] Seleccionar modelo
echo   [4] Descargar modelo
echo.
echo   [0] Volver
echo.
set /p "ollama_choice=   Opcion: "

if "%ollama_choice%"=="1" goto ollama_start
if "%ollama_choice%"=="2" goto ollama_list
if "%ollama_choice%"=="3" goto ollama_select
if "%ollama_choice%"=="4" goto ollama_pull
if "%ollama_choice%"=="0" goto menu
goto ollama_menu

:ollama_start
cls
color 0A
echo.
echo   Iniciando Ollama...
color 07
echo.
start "" ollama serve
echo   Ollama iniciado en segundo plano.
echo.
pause
goto ollama_menu

:ollama_list
cls
color 0B
echo.
echo   MODELOS INSTALADOS
echo   ------------------
color 07
echo.
ollama list
echo.
pause
goto ollama_menu

:ollama_select
cls
color 0B
echo.
echo   SELECCIONAR MODELO
echo   ------------------
color 07
echo.
echo   Modelo actual: %CURRENT_MODEL%
echo.
echo   Cargando modelos...
echo.

REM Obtener lista de modelos y guardar en archivo temporal
ollama list > "%TEMP%\ollama_models_raw.txt" 2>nul

REM Procesar y numerar modelos (saltar header)
set "model_count=0"
for /f "skip=1 tokens=1" %%a in (%TEMP%\ollama_models_raw.txt) do (
    set /a model_count+=1
    set "model_!model_count!=%%a"
)

cls
color 0B
echo.
echo   SELECCIONAR MODELO
echo   ------------------
color 07
echo.
echo   Modelo actual: !CURRENT_MODEL!
echo.

if !model_count! EQU 0 (
    color 0C
    echo   No se encontraron modelos instalados.
    echo   Usa la opcion "Descargar modelo" primero.
    color 07
    echo.
    pause
    goto ollama_menu
)

echo   Modelos disponibles:
echo.
for /l %%i in (1,1,!model_count!) do (
    echo   [%%i] !model_%%i!
)
echo.
echo   [0] Cancelar
echo.

set /p "model_choice=   Selecciona: "

if "!model_choice!"=="0" goto ollama_menu

REM Validar seleccion
set "valid=0"
if !model_choice! GEQ 1 if !model_choice! LEQ !model_count! set "valid=1"

if "!valid!"=="1" (
    set "CURRENT_MODEL=!model_%model_choice%!"
    color 0A
    echo.
    echo   Modelo seleccionado: !CURRENT_MODEL!
    color 07
    timeout /t 2 >nul
    goto ollama_menu
)

echo.
echo   Opcion invalida.
timeout /t 1 >nul
goto ollama_select

:ollama_pull
cls
color 0B
echo.
echo   DESCARGAR MODELO
echo   ----------------
color 07
echo.
echo   Ejemplos: llama3.2:3b, qwen2.5:7b, mistral:7b
echo.
set /p "PULL_MODEL=   Nombre del modelo a descargar: "
if not "%PULL_MODEL%"=="" (
    echo.
    color 0E
    echo   Descargando %PULL_MODEL%...
    color 07
    echo.
    ollama pull %PULL_MODEL%
    echo.
    pause
)
goto ollama_menu

:set_url
cls
color 0B
echo.
echo   CONFIGURAR URL
echo   --------------
color 07
echo.
echo   Actual: %CURRENT_URL%
echo.
set /p "NEW_URL=   Nueva URL: "
if not "%NEW_URL%"=="" set "CURRENT_URL=%NEW_URL%"
goto menu

:set_basedir
cls
color 0B
echo.
echo   DIRECTORIO BASE
echo   ---------------
color 07
echo.
echo   Actual: %CURRENT_BASEDIR%
echo.
set /p "NEW_BASEDIR=   Nuevo: "
if not "%NEW_BASEDIR%"=="" set "CURRENT_BASEDIR=%NEW_BASEDIR%"
goto menu

:set_extradir
cls
color 0B
echo.
echo   DIRECTORIO EXTRA (solo lectura)
echo   -------------------------------
color 07
echo.
echo   Actual: %CURRENT_EXTRADIR%
echo.
set /p "NEW_EXTRADIR=   Nuevo: "
if not "%NEW_EXTRADIR%"=="" set "CURRENT_EXTRADIR=%NEW_EXTRADIR%"
goto menu

:save
call :save_silent
color 0A
echo.
echo   Guardado correctamente.
color 07
timeout /t 2 >nul
goto menu

:start_agent
call :save_silent
cls
color 0A
echo.
echo   Iniciando Archie...
color 07
echo.
npm run dev
pause
goto menu

:save_silent
(
echo OLLAMA_BASE_URL=%CURRENT_URL%
echo OLLAMA_MODEL=%CURRENT_MODEL%
echo ARCHIE_BASE_DIR=%CURRENT_BASEDIR%
echo EXTRA_READ_DIR=%CURRENT_EXTRADIR%
) > .env
exit /b
