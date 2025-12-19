# Configuração do Google Service Account para GitHub Actions

Este guia explica como configurar o GitHub Secret necessário para deploy automático das credenciais do Gmail API.

## Passo 1: Obter o arquivo de credenciais do servidor

Execute no servidor de produção:

```bash
# Conectar ao servidor
ssh farmaeasy

# Exibir o conteúdo do arquivo de credenciais (copie a saída)
cat /var/www/html/farmaeasy/api/credentials/google-service-account.json
```

**⚠️ IMPORTANTE**: Este arquivo contém credenciais sensíveis. Nunca commite este arquivo no repositório!

## Passo 2: Converter para Base64

No seu computador local, salve o JSON copiado em um arquivo temporário e converta para base64:

```bash
# Salvar o JSON em um arquivo temporário
cat > /tmp/google-service-account.json << 'EOF'
{
  "type": "service_account",
  "project_id": "...",
  ...
}
EOF

# Converter para base64 (copie a saída)
base64 -w 0 /tmp/google-service-account.json

# IMPORTANTE: Apagar o arquivo temporário após copiar
rm /tmp/google-service-account.json
```

**Alternativa (se você já tem o arquivo)**:
```bash
base64 -w 0 api/credentials/google-service-account.json
```

## Passo 3: Adicionar GitHub Secret

1. Acesse o repositório no GitHub
2. Vá em **Settings** → **Secrets and variables** → **Actions**
3. Clique em **New repository secret**
4. Configure:
   - **Name**: `GOOGLE_SERVICE_ACCOUNT_JSON`
   - **Secret**: Cole o conteúdo base64 do passo anterior
5. Clique em **Add secret**

## Passo 4: Verificar o Secret

Após adicionar, você verá o secret listado como `GOOGLE_SERVICE_ACCOUNT_JSON` na página de Secrets.

**⚠️ Você não poderá visualizar o valor do secret após salvar - isso é por segurança.**

## Passo 5: Testar o Deploy

Execute um deploy manual para testar:

1. Vá em **Actions** → **Deploy** workflow
2. Clique em **Run workflow**
3. Selecione a branch `main`
4. Marque **Deploy API**
5. Clique em **Run workflow**

O workflow irá:
1. Decodificar o secret base64
2. Criar o arquivo `google-service-account.json`
3. Sincronizar para o servidor
4. Fazer deploy do container com as credenciais montadas

## Verificação Pós-Deploy

Após o deploy, verifique se o email funciona:

```bash
# Testar envio de email (ajuste o email)
curl -X POST "https://api.farmaeasy.com.br/v1/auth/password/forgot" \
  -H "Content-Type: application/json" \
  -d '{"email": "seu-email@example.com"}'

# Verificar logs do container
ssh farmaeasy "docker logs farmaeasy-api-prod-green --tail 20 | grep email_sent"
```

Você deve ver um log com `message_id` indicando que o email foi enviado com sucesso.

## Troubleshooting

### Secret não está sendo encontrado
- Verifique se o nome do secret está EXATAMENTE como `GOOGLE_SERVICE_ACCOUNT_JSON`
- Certifique-se de que está adicionando como **repository secret** e não como environment secret

### Erro ao decodificar base64
- Certifique-se de usar `base64 -w 0` para gerar base64 sem quebras de linha
- Verifique se não há espaços extras no início/fim do secret

### Credenciais inválidas após deploy
- Verifique se o arquivo JSON original está válido
- Teste localmente: `cat credentials.json | jq .` (deve mostrar JSON válido)
- Verifique se o arquivo tem todas as propriedades necessárias

## Segurança

✅ **O que fazemos**:
- Credenciais armazenadas como GitHub Secret (criptografado)
- Arquivo criado apenas durante o deploy (temporário no runner)
- Sincronizado via SSH para o servidor
- Arquivo montado como volume read-only no container

❌ **O que NÃO fazer**:
- Nunca commitar o arquivo `google-service-account.json` no repositório
- Nunca exibir o conteúdo do arquivo em logs públicos
- Nunca compartilhar o arquivo em canais não seguros

## Manutenção

Se precisar atualizar as credenciais:

1. Gere novas credenciais no Google Cloud Console
2. Repita os passos 1-3 acima com o novo arquivo
3. No GitHub, edite o secret `GOOGLE_SERVICE_ACCOUNT_JSON` com o novo valor base64
4. Execute um novo deploy para aplicar as novas credenciais
