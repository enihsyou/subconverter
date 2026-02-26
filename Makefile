# Makefile for Windows
# see .github/workflows for Linux

# 定义变量
VERSION := v0.9.0

# 默认目标应该列在第一位并提供帮助信息
.DEFAULT_GOAL := help

.PHONY: help
help:
	@echo simple bootstrap makefile for the project, refer to README.md for more information

.PHONY: .subconverter_env
.subconverter_env:
	@type nul >> $@
	@echo paste your subscription url to $@

subconverter.exe:
	http --download https://github.com/tindy2013/subconverter/releases/download/$(VERSION)/subconverter_win64.7z
	7z e subconverter.7z subconverter/subconverter.exe
	del .\subconverter.7z

.venv:
	uv venv

.PHONY: merlinclash.yaml
merlinclash.yaml:
	open "https://s1.thefew01.top"
	.\subconverter.exe -g

merlinclash_deduplicated.yaml: merlinclash.yaml .venv
	uv pip install ruamel-yaml==0.18.10
	uv run scripts/deduplicate_rules.py $<

.PHONY: upload_gist
upload_gist: merlinclash_deduplicated.yaml
	uv pip install PyGithub==2.8.1
	uv run scripts/upload_gist.py $< merlinclash.yaml

.PHONY: clean
clean:
	del /Q subconverter.exe
	del /Q merlinclash.yaml
	del /Q merlinclash_deduplicated.yaml
