#!/usr/bin/env bash
# =============================================================================
# Blue-Green Deploy para FarmaEasy API - ZERO DOWNTIME
# =============================================================================
# - Profiles: blue/green
# - Services: farmaeasy-api-prod-{blue,green}
# - Ports: blue=8001, green=8002
# - Health: /health/ready
#
# ZERO DOWNTIME GARANTIDO:
# 1. Sobe novos containers e aguarda health check
# 2. Atualiza nginx para direcionar tráfego para novos containers
# 3. Somente então para os containers antigos
#
# Comandos:
#   ./blue-green-deploy.sh deploy [tag]       - Deploy com zero downtime
#   ./blue-green-deploy.sh rollback [profile] - Rollback para blue/green
#   ./blue-green-deploy.sh status             - Status completo do sistema
#   ./blue-green-deploy.sh nginx-status       - Status do nginx upstream
#   ./blue-green-deploy.sh update-nginx [profile] - Atualiza nginx manualmente
# =============================================================================
set -Eeuo pipefail

# Logging helpers
log() { echo -e "\033[0;32m[$(date +'%F %T')] $*\033[0m"; }
err() { echo -e "\033[0;31m[$(date +'%F %T')] $*\033[0m"; }
warn() { echo -e "\033[0;33m[$(date +'%F %T')] $*\033[0m"; }
info() { echo -e "\033[0;36m[$(date +'%F %T')] $*\033[0m"; }

# Falha segura: mostra linha ao errar
trap 'err "Falha na execucao do deploy (linha $LINENO)"; exit 1' ERR

# Configurações (podem ser sobrescritas via env)
BLUE_PORT=${BLUE_PORT:-8001}
GREEN_PORT=${GREEN_PORT:-8002}

# Health check configuration
HEALTH_PATH=${HEALTH_PATH:-"/health/ready"}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-120}
SLEEP_AFTER_SWITCH=${SLEEP_AFTER_SWITCH:-10}

BLUE_PROFILE=${BLUE_PROFILE:-"blue"}
GREEN_PROFILE=${GREEN_PROFILE:-"green"}
SERVICE_BASE=${SERVICE_BASE:-"farmaeasy-api-prod"}

# Nginx configuration for zero-downtime deploy
NGINX_CONFIG_PATH=${NGINX_CONFIG_PATH:-"/etc/nginx/sites-available/api.farmaeasy.com.br"}
NGINX_ENABLED_PATH=${NGINX_ENABLED_PATH:-"/etc/nginx/sites-enabled/api.farmaeasy.com.br"}
ENABLE_NGINX_UPDATE=${ENABLE_NGINX_UPDATE:-"true"}

# Docker compose file
COMPOSE_FILE=${COMPOSE_FILE:-"docker-compose.prod.yml"}

# Checa saúde via health endpoint
is_up() {
    local port=$1
    local health_endpoint=${2:-$HEALTH_PATH}
    local code
    code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${port}${health_endpoint}" 2>/dev/null || echo "000")
    [[ $code == "200" ]]
}

wait_health() {
    local port=$1 profile=$2 health_endpoint=${3:-$HEALTH_PATH}
    local start=$(date +%s)
    log "Aguardando saude em :${port} (profile=${profile}, endpoint=${health_endpoint})..."
    while true; do
        if is_up "$port" "$health_endpoint"; then
            log "Saude OK em :${port}"
            return 0
        fi
        local now=$(date +%s)
        if ((now - start > HEALTH_TIMEOUT)); then
            err "Timeout aguardando saude em :${port}"
            docker compose -f "$COMPOSE_FILE" --profile "$profile" logs --tail=120 || true
            return 1
        fi
        sleep 2
        printf "."
    done
}

wait_down() {
    local port=$1 timeout=${2:-30}
    local start=$(date +%s)
    log "Aguardando porta :${port} desligar (timeout=${timeout}s)..."
    while true; do
        if ! is_up "$port"; then
            log "Porta :${port} indisponivel"
            return 0
        fi
        local now=$(date +%s)
        if ((now - start > timeout)); then
            warn "Timeout aguardando porta :${port} desligar"
            return 1
        fi
        sleep 2
    done
}

detect_active() {
    if is_up "$BLUE_PORT"; then
        echo blue
    elif is_up "$GREEN_PORT"; then
        echo green
    else
        echo none
    fi
}

start_service() {
    local profile=$1 service=$2
    log "Iniciando servico: $service (profile: $profile)"
    docker compose -f "$COMPOSE_FILE" --profile "$profile" up -d --pull always "$service"
}

stop_service() {
    local profile=$1 service=$2
    log "Parando servico: $service (profile: $profile)"
    docker compose -f "$COMPOSE_FILE" --profile "$profile" stop "$service" || true
    docker compose -f "$COMPOSE_FILE" --profile "$profile" rm -f "$service" || true
}

# =============================================================================
# NGINX UPSTREAM UPDATE - ZERO DOWNTIME
# =============================================================================
update_nginx_upstream() {
    local target_profile=$1
    local api_port backup_port

    # Determina portas baseado no profile alvo
    case "$target_profile" in
    blue)
        api_port=$BLUE_PORT
        backup_port=$GREEN_PORT
        ;;
    green)
        api_port=$GREEN_PORT
        backup_port=$BLUE_PORT
        ;;
    *)
        err "Profile invalido para nginx update: $target_profile"
        return 1
        ;;
    esac

    # Verifica se update está habilitado
    if [[ "$ENABLE_NGINX_UPDATE" != "true" ]]; then
        warn "NGINX update desabilitado (ENABLE_NGINX_UPDATE=$ENABLE_NGINX_UPDATE)"
        return 0
    fi

    # Verifica se arquivo nginx existe
    if [[ ! -f "$NGINX_CONFIG_PATH" ]]; then
        warn "Arquivo nginx nao encontrado: $NGINX_CONFIG_PATH"
        warn "Pulando atualizacao do nginx - configure NGINX_CONFIG_PATH ou atualize manualmente"
        return 0
    fi

    info "Atualizando nginx upstream para profile: $target_profile"
    info "   API primario: :${api_port} (backup: :${backup_port})"

    # Cria backup da configuração atual
    local backup_file="${NGINX_CONFIG_PATH}.bak.$(date +%Y%m%d_%H%M%S)"
    cp "$NGINX_CONFIG_PATH" "$backup_file"
    log "   Backup criado: $backup_file"

    # Cria arquivo temporário para a nova configuração
    local temp_config
    temp_config=$(mktemp)

    # Usa sed para atualizar os upstreams
    # Padrão: substitui as linhas de server dentro dos blocos upstream
    sed -E "
        # Upstream farmaeasy_api - atualiza portas
        /upstream[[:space:]]+farmaeasy_api[[:space:]]*\{/,/\}/ {
            s/server[[:space:]]+127\.0\.0\.1:800[0-9];/server 127.0.0.1:${api_port};/
            s/server[[:space:]]+127\.0\.0\.1:800[0-9][[:space:]]+backup;/server 127.0.0.1:${backup_port} backup;/
        }
    " "$NGINX_CONFIG_PATH" > "$temp_config"

    # Verifica se a substituição foi feita
    if ! grep -q "server 127.0.0.1:${api_port};" "$temp_config"; then
        warn "   Substituicao nao detectada - verificando formato do nginx"
    fi

    # Substitui o arquivo original
    mv "$temp_config" "$NGINX_CONFIG_PATH"

    # Testa configuração do nginx
    log "   Testando configuracao nginx..."
    if ! nginx -t 2>&1; then
        err "Configuracao nginx invalida! Restaurando backup..."
        cp "$backup_file" "$NGINX_CONFIG_PATH"
        return 1
    fi

    # Reload do nginx
    log "   Recarregando nginx..."
    if ! nginx -s reload 2>&1; then
        err "Falha ao recarregar nginx! Restaurando backup..."
        cp "$backup_file" "$NGINX_CONFIG_PATH"
        nginx -s reload || true
        return 1
    fi

    log "Nginx atualizado com sucesso!"
    log "   Requests agora vao para: ${target_profile} (API:${api_port})"

    # Remove backups antigos (mantém últimos 5)
    find "$(dirname "$NGINX_CONFIG_PATH")" -name "$(basename "$NGINX_CONFIG_PATH").bak.*" -type f | \
        sort -r | tail -n +6 | xargs -r rm -f

    return 0
}

# Função para verificar status atual do nginx
nginx_status() {
    info "NGINX Upstream Status"
    if [[ ! -f "$NGINX_CONFIG_PATH" ]]; then
        warn "   Arquivo nao encontrado: $NGINX_CONFIG_PATH"
        return 1
    fi

    echo "   Config: $NGINX_CONFIG_PATH"
    echo "   farmaeasy_api upstream:"
    grep -A 3 "upstream farmaeasy_api" "$NGINX_CONFIG_PATH" 2>/dev/null | grep "server" | sed 's/^/      /'
}

deploy() {
    local tag=${1:-latest}
    export IMAGE_TAG="$tag"
    info "DEPLOY - tag=$tag"

    local active next active_port next_port active_profile next_profile
    active=$(detect_active)
    case "$active" in
    blue)
        next=green
        active_port=$BLUE_PORT
        next_port=$GREEN_PORT
        active_profile=$BLUE_PROFILE
        next_profile=$GREEN_PROFILE
        ;;
    green)
        next=blue
        active_port=$GREEN_PORT
        next_port=$BLUE_PORT
        active_profile=$GREEN_PROFILE
        next_profile=$BLUE_PROFILE
        ;;
    none)
        next=blue
        active_port=0
        next_port=$BLUE_PORT
        active_profile=""
        next_profile=$BLUE_PROFILE
        ;;
    esac

    log "Subindo servico ${next} (profile=${next_profile})"
    log "   API: :${next_port}"

    # Inicia o serviço do próximo ambiente
    local service="${SERVICE_BASE}-${next}"
    start_service "$next_profile" "$service"

    # Aguarda saúde
    wait_health "$next_port" "$next_profile" "$HEALTH_PATH"

    # =========================================================================
    # ZERO DOWNTIME: Atualiza nginx ANTES de parar os serviços antigos
    # =========================================================================
    log "Atualizando nginx para direcionar trafego para ${next_profile}..."
    local nginx_updated=false
    if update_nginx_upstream "$next_profile"; then
        nginx_updated=true
        log "Nginx atualizado com sucesso"
    else
        err "CRITICO: Falha ao atualizar nginx!"
        err "   Novos servicos estao rodando em ${next_profile}"
        err "   Servicos antigos NAO serao parados para evitar downtime"
        return 1
    fi

    # Pequena pausa para nginx processar conexões em andamento
    sleep 2

    # Para os serviços ativos anteriores (se existirem)
    if [[ -n $active_profile ]] && [[ "$nginx_updated" == "true" ]]; then
        log "Descendo servicos ativos anteriores (profile=${active_profile})"
        local old_service="${SERVICE_BASE}-${active}"
        stop_service "$active_profile" "$old_service"
        [[ $active_port != 0 ]] && wait_down "$active_port" 30 || true
    fi

    log "Aguardando estabilizacao ${SLEEP_AFTER_SWITCH}s"
    sleep "$SLEEP_AFTER_SWITCH"

    # Verificação final de saúde
    wait_health "$next_port" "$next_profile" "$HEALTH_PATH"

    log "Blue-Green concluido!"
    log "   Profile ativo: ${next}"
    log "   API: :${next_port}"
}

rollback() {
    local target=${1-}
    if [[ -z $target ]]; then
        local active=$(detect_active)
        case "$active" in
        blue) target=green ;;
        green) target=blue ;;
        *)
            err "Nada ativo para determinar rollback"
            exit 1
            ;;
        esac
    fi

    local profile port other other_profile other_port
    case "$target" in
    blue)
        profile=$BLUE_PROFILE
        port=$BLUE_PORT
        other=green
        other_profile=$GREEN_PROFILE
        other_port=$GREEN_PORT
        ;;
    green)
        profile=$GREEN_PROFILE
        port=$GREEN_PORT
        other=blue
        other_profile=$BLUE_PROFILE
        other_port=$BLUE_PORT
        ;;
    *)
        err "Alvo de rollback invalido: $target"
        exit 1
        ;;
    esac

    info "ROLLBACK para ${target}"
    info "   API: :${port}"

    # Inicia serviços do ambiente de rollback
    local service="${SERVICE_BASE}-${target}"
    start_service "$profile" "$service"
    wait_health "$port" "$profile" "$HEALTH_PATH"

    # ZERO DOWNTIME: Atualiza nginx ANTES de parar os serviços do outro ambiente
    log "Atualizando nginx para rollback target: ${target}..."
    if ! update_nginx_upstream "$target"; then
        err "CRITICO: Falha ao atualizar nginx no rollback!"
        return 1
    fi
    log "Nginx atualizado para rollback target: ${target}"

    # Pequena pausa para nginx processar conexões
    sleep 2

    # Para serviços do outro ambiente
    local other_service="${SERVICE_BASE}-${other}"
    stop_service "$other_profile" "$other_service" || true
    wait_down "$other_port" 30 || true

    log "Rollback concluido para ${target}"
    log "   API: :${port}"
}

status_cmd() {
    log "STATUS"
    echo
    echo "BLUE Profile:"
    echo -n "   API (:${BLUE_PORT}): "
    if is_up "$BLUE_PORT"; then echo "UP"; else echo "DOWN"; fi
    echo
    echo "GREEN Profile:"
    echo -n "   API (:${GREEN_PORT}): "
    if is_up "$GREEN_PORT"; then echo "UP"; else echo "DOWN"; fi
    echo
    echo "Profile Ativo: $(detect_active)"
    echo
    echo "Docker Compose Status:"
    docker compose -f "$COMPOSE_FILE" ps || true
    echo
    nginx_status || true
}

case "${1-}" in
deploy) deploy "${2:-latest}" ;;
rollback) rollback "${2-}" ;;
status) status_cmd ;;
nginx-status) nginx_status ;;
update-nginx)
    if [[ -z "${2-}" ]]; then
        err "Uso: $0 update-nginx [blue|green]"
        exit 1
    fi
    update_nginx_upstream "$2"
    ;;
*)
    echo "Uso: $0 {deploy [tag]|rollback [blue|green]|status|nginx-status|update-nginx [blue|green]}"
    exit 1
    ;;
esac

exit 0
