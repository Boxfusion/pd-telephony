@rem
@rem Copyright 2015 the original author or authors.
@rem
@rem Licensed under the Apache License, Version 2.0 (the "License");
@rem you may not use this file except in compliance with the License.
@rem You may obtain a copy of the License at
@rem
@rem      https://www.apache.org/licenses/LICENSE-2.0
@rem
@rem Unless required by applicable law or agreed to in writing, software
@rem distributed under the License is distributed on an "AS IS" BASIS,
@rem WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
@rem See the License for the specific language governing permissions and
@rem limitations under the License.
@rem
@rem SPDX-License-Identifier: Apache-2.0
@rem

@if "%DEBUG%"=="" @echo off
@rem ##########################################################################
@rem
@rem  allure startup script for Windows
@rem
@rem ##########################################################################

@rem Set local scope for the variables, and ensure extensions are enabled
setlocal EnableExtensions

set DIRNAME=%~dp0
if "%DIRNAME%"=="" set DIRNAME=.
@rem This is normally unused
set APP_BASE_NAME=%~n0
set APP_HOME=%DIRNAME%..

@rem Resolve any "." and ".." in APP_HOME to make it shorter.
for %%i in ("%APP_HOME%") do set APP_HOME=%%~fi

@rem Add default JVM options here. You can also use JAVA_OPTS and ALLURE_OPTS to pass JVM options to this script.
set DEFAULT_JVM_OPTS=

@rem Find java.exe
if defined JAVA_HOME goto findJavaFromJavaHome

set JAVA_EXE=java.exe
%JAVA_EXE% -version >NUL 2>&1
if %ERRORLEVEL% equ 0 goto execute

echo. 1>&2
echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH. 1>&2
echo. 1>&2
echo Please set the JAVA_HOME variable in your environment to match the 1>&2
echo location of your Java installation. 1>&2

"%COMSPEC%" /c exit 1

:findJavaFromJavaHome
set JAVA_HOME=%JAVA_HOME:"=%
set JAVA_EXE=%JAVA_HOME%/bin/java.exe

if exist "%JAVA_EXE%" goto execute

echo. 1>&2
echo ERROR: JAVA_HOME is set to an invalid directory: %JAVA_HOME% 1>&2
echo. 1>&2
echo Please set the JAVA_HOME variable in your environment to match the 1>&2
echo location of your Java installation. 1>&2

"%COMSPEC%" /c exit 1

:execute
@rem Setup the command line

set CLASSPATH=%APP_HOME%\lib\allure-commandline-2.42.0.jar;%APP_HOME%\lib\slf4j-jdk14-2.0.18.jar;%APP_HOME%\lib\jcommander-1.82.jar;%APP_HOME%\lib\allure-generator-2.42.0.jar;%APP_HOME%\lib\jackson-dataformat-xml-2.21.3.jar;%APP_HOME%\lib\allure-plugin-api-2.42.0.jar;%APP_HOME%\lib\jackson-module-jaxb-annotations-2.21.3.jar;%APP_HOME%\lib\jackson-core-2.21.3.jar;%APP_HOME%\lib\jackson-dataformat-yaml-2.21.3.jar;%APP_HOME%\lib\jackson-databind-2.21.3.jar;%APP_HOME%\lib\commons-io-2.22.0.jar;%APP_HOME%\lib\allure1-model-1.0.jar;%APP_HOME%\lib\slf4j-api-2.0.18.jar;%APP_HOME%\lib\jackson-annotations-2.21.jar;%APP_HOME%\lib\snakeyaml-2.5.jar;%APP_HOME%\lib\allure-model-2.34.0.jar;%APP_HOME%\lib\jaxb-api-2.3.1.jar;%APP_HOME%\lib\httpclient-4.5.14.jar;%APP_HOME%\lib\freemarker-2.3.34.jar;%APP_HOME%\lib\jsoup-1.22.2.jar;%APP_HOME%\lib\opencsv-5.12.0.jar;%APP_HOME%\lib\flexmark-ext-tables-0.62.2.jar;%APP_HOME%\lib\flexmark-0.62.2.jar;%APP_HOME%\lib\woodstox-core-7.1.1.jar;%APP_HOME%\lib\stax2-api-4.2.2.jar;%APP_HOME%\lib\jakarta.activation-api-1.2.2.jar;%APP_HOME%\lib\javax.activation-api-1.2.0.jar;%APP_HOME%\lib\properties-2.0.RC5.jar;%APP_HOME%\lib\jaxb-utils-1.0.jar;%APP_HOME%\lib\httpcore-4.4.16.jar;%APP_HOME%\lib\commons-beanutils-1.11.0.jar;%APP_HOME%\lib\commons-logging-1.3.5.jar;%APP_HOME%\lib\commons-codec-1.11.jar;%APP_HOME%\lib\commons-text-1.13.1.jar;%APP_HOME%\lib\commons-lang3-3.20.0.jar;%APP_HOME%\lib\commons-collections4-4.5.0.jar;%APP_HOME%\lib\flexmark-util-0.62.2.jar;%APP_HOME%\lib\flexmark-util-format-0.62.2.jar;%APP_HOME%\lib\flexmark-util-ast-0.62.2.jar;%APP_HOME%\lib\flexmark-util-builder-0.62.2.jar;%APP_HOME%\lib\flexmark-util-dependency-0.62.2.jar;%APP_HOME%\lib\flexmark-util-html-0.62.2.jar;%APP_HOME%\lib\flexmark-util-options-0.62.2.jar;%APP_HOME%\lib\flexmark-util-sequence-0.62.2.jar;%APP_HOME%\lib\flexmark-util-collection-0.62.2.jar;%APP_HOME%\lib\flexmark-util-data-0.62.2.jar;%APP_HOME%\lib\flexmark-util-misc-0.62.2.jar;%APP_HOME%\lib\flexmark-util-visitor-0.62.2.jar;%APP_HOME%\lib\commons-collections-3.2.2.jar;%APP_HOME%\lib\annotations-15.0.jar;%APP_HOME%\lib\config


@rem Execute allure
@rem endlocal doesn't take effect until after the line is parsed and variables are expanded
@rem which allows us to clear the local environment before executing the java command
endlocal & "%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %ALLURE_OPTS%  -classpath "%CLASSPATH%" io.qameta.allure.CommandLine %* & call :exitWithErrorLevel

:exitWithErrorLevel
@rem Use "%COMSPEC%" /c exit to allow operators to work properly in scripts
"%COMSPEC%" /c exit %ERRORLEVEL%
