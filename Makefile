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

.PHONY: merlinclash.yaml
merlinclash.yaml:
	.\subconverter.exe -g

merlinclash_deduplicated.yaml: merlinclash.yaml
	uv pip install ruamel.yaml
	uv run scripts/deduplicate_rules.py $<

gistconf.ini:
	copy gistconf.example.ini gistconf.ini

.PHONY: gist
gist: merlinclash_deduplicated.yaml
	uv run scripts/gist_uploader.py $< --filename "merlinclash.yaml"

.PHONY: clean
clean:
	del /Q subconverter.exe
	del /Q merlinclash.yaml
	del /Q merlinclash_deduplicated.yaml

