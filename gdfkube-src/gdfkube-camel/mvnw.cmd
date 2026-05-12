@REM Maven Wrapper for Windows
@echo off
setlocal

set "MAVEN_PROJECTBASEDIR=%~dp0"
set "MAVEN_WRAPPER_PROPERTIES=%MAVEN_PROJECTBASEDIR%.mvn\wrapper\maven-wrapper.properties"

set "MAVEN_USER_HOME=%USERPROFILE%\.m2"
set "MAVEN_HOME=%MAVEN_USER_HOME%\wrapper\dists\apache-maven-3.9.9"

if exist "%MAVEN_HOME%\bin\mvn.cmd" goto runMaven

echo Downloading Maven distribution...
mkdir "%MAVEN_HOME%" 2>nul
set "TMP_ZIP=%MAVEN_USER_HOME%\wrapper\dists\maven.zip"
mkdir "%MAVEN_USER_HOME%\wrapper\dists" 2>nul
powershell -Command "Invoke-WebRequest -Uri 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.zip' -OutFile '%TMP_ZIP%'"
powershell -Command "Expand-Archive -Path '%TMP_ZIP%' -DestinationPath '%MAVEN_USER_HOME%\wrapper\dists' -Force"
del "%TMP_ZIP%"

:runMaven
"%MAVEN_HOME%\bin\mvn.cmd" -Dmaven.multiModuleProjectDirectory="%MAVEN_PROJECTBASEDIR%" %*
