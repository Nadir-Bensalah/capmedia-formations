#!/usr/bin/env python3
"""Serveur de développement pour le site agence.

En production, un fichier .htaccess sert /suivi/projet depuis projet.html.
Le serveur de base de Python ne sait pas le faire, et les écrans se
testeraient donc dans des conditions différentes de la réalité. Ce
serveur ajoute exactement cette règle, et rien d'autre.

    python3 fonctions/outils/serveur-local.py [port]

La racine servie est le dossier agence/ du dépôt.
"""

import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

RACINE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'agence')


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        chemin = super().translate_path(path)
        # /suivi/projet sert projet.html, comme le .htaccess de production.
        if not os.path.exists(chemin) and not path.endswith('/'):
            avec_html = chemin + '.html'
            if os.path.isfile(avec_html):
                return avec_html
        return chemin

    def end_headers(self):
        # Pas de cache : on teste toujours le dernier état des fichiers.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, formation, *args):
        pass  # silence : les erreurs utiles viennent des tests


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    serveur = ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=os.path.normpath(RACINE)))
    print(f'Site agence servi sur http://127.0.0.1:{port}/ (racine {os.path.normpath(RACINE)})')
    print(f'Espace de suivi : http://127.0.0.1:{port}/suivi/?emul')
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass
