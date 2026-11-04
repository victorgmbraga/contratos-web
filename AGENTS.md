# Instruções para agentes

## Validação, commit e push

Ao concluir cada alteração solicitada, execute as verificações pertinentes ao seu alcance. Depois de validar a alteração, crie um commit com uma mensagem descritiva e faça push automaticamente, sem solicitar uma nova confirmação ao usuário.

- Trabalhe numa branch própria, nunca diretamente na `main`, salvo quando o usuário indicar outra branch.
- Ao concluir cada tarefa que altere arquivos, abra um pull request para a `main` sem pedir confirmação, ou atualize o pull request já aberto da mesma branch. Se o pull request anterior da branch já foi mergeado, recomece a branch a partir da `main` atual e abra um novo pull request.
- Acompanhe a validação do pull request e trate as revisões. Quando todos os jobs do GitHub Actions do commit atual do pull request passarem e não houver revisões pendentes, faça o merge na `main` sem pedir confirmação e apague a branch remota do pull request. Em seguida, acompanhe a publicação da `main` conforme a seção abaixo.
- Inclua no commit apenas os arquivos da alteração concluída. Preserve alterações preexistentes ou não relacionadas e não inclua credenciais ou artefatos gerados.
- Antes do push, busque o histórico remoto e integre atualizações necessárias, preservando os commits e o trabalho existentes. Não use push forçado.
- Quando a integração afetar os arquivos ou o comportamento alterados, repita as verificações pertinentes antes de enviar.
- Se a validação ou a sincronização ficar bloqueada, informe o motivo e o estado do trabalho. Só declare o push concluído após confirmar o resultado remoto.
- Tarefas de consulta, análise ou explicação que não alterem arquivos não exigem um commit.

## Acompanhamento do GitHub Actions e do GitHub Pages

- Após cada push num pull request ou na `main`, identifique a execução do GitHub Actions correspondente ao SHA enviado e acompanhe-a até a conclusão. Não considere o trabalho concluído apenas porque o push foi aceito.
- Para publicações da `main`, confirme que os jobs de validação e deploy terminaram com sucesso e que o deployment do ambiente `github-pages` corresponde ao commit enviado.
- Após o deploy, verifique o site público em `https://contratos-web.net.br/`, incluindo o carregamento da página e dos recursos principais. Quando a alteração afetar uma funcionalidade, faça também uma verificação pertinente no site publicado, quando viável.
- Se uma execução falhar, examine os logs e corrija problemas relacionados à alteração dentro do escopo autorizado; valide, envie a correção e acompanhe a nova execução. Informe bloqueios externos, cancelamentos e falhas pendentes sem declarar a publicação concluída.
- No resultado final, informe o estado do GitHub Actions e do deploy, com links para a execução e o site quando úteis. Para branches sem publicação configurada, informe que o deploy não se aplica.
