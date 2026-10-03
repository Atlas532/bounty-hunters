# Bounty Hunters — GitHub Pages

Versão estática do jogo: não precisa de Replit, Node.js, npm ou servidor pago.

## Arquivos para enviar ao GitHub

Envie **estes arquivos/pasta para a raiz do repositório**:

- `index.html`
- `style.css`
- `game.js`
- `assets/`

Não envie a pasta `bounty-hunters-github` como uma subpasta. Os arquivos acima precisam aparecer logo na página principal do repositório.

## Publicar no GitHub Pages

1. Abra o repositório no GitHub.
2. Vá em **Settings**.
3. Entre em **Pages**.
4. Em **Source**, escolha `Deploy from a branch`.
5. Branch: `main`.
6. Folder: `/ (root)`.
7. Salve.
8. Aguarde o GitHub gerar o endereço do site.

## Multiplayer

- Jogador 1: **CRIAR SALA**.
- Copie o código de 5 caracteres.
- Jogador 2: abra o mesmo site, digite o código e aperte **ENTRAR**.
- O multiplayer é P2P via WebRTC/PeerJS.
- Algumas redes escolares, VPNs ou firewalls podem bloquear WebRTC.
- O modo **TREINAR SOZINHO** funciona sem conexão com outro jogador.

## Controles

- WASD — mover
- Mouse — mirar
- Clique esquerdo — atirar
- Espaço — ataque corpo a corpo
- Shift — esquiva/dash
- E — interagir, pegar contrato, capturar alvo e reviver parceiro

## Observação

O jogo carrega Phaser e PeerJS de CDN. Portanto, precisa de internet para iniciar.
