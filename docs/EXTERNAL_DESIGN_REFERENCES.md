# External Design References

## Local-model workflow

SynapseX's optional local-model package follows Ollama's documented local CLI/API model. Ollama documents that its API becomes available locally once the service is running, and its quickstart supports local models on Windows, macOS, and Linux.

- [Ollama API introduction](https://docs.ollama.com/api/introduction)
- [Ollama quickstart](https://docs.ollama.com/quickstart)
- [Ollama CLI reference](https://docs.ollama.com/cli)

## Defensive agent boundaries

The target confirmation, least-privilege, human approval, output validation, monitoring, and no-false-execution rules align with these public references.

- [OWASP AI Agent Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html)
- [NIST Secure Software Development, Security, and Operations Practices](https://pages.nist.gov/nccoe-devsecops/introduction.html)
- [OWASP AISVS Appendix C: AI-Assisted Secure Coding](https://github.com/OWASP/AISVS/blob/main/1.0/en/0x92-Appendix-C_AI_for_Code_Generation.md)
