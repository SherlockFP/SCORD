"""Exercise the public HTTP/WebSocket surface without touching real room data."""
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

import server


class IntegrationTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.room = server.Room('integration', 'Integration', 'owner')
        self.stack.enter_context(patch.object(server, 'rooms', {'integration': self.room}))
        self.stack.enter_context(patch.object(server, 'load_db'))
        self.stack.enter_context(patch.object(server, 'save_db'))
        self.schedule_save = self.stack.enter_context(patch.object(server, 'schedule_save_db'))
        self.stack.enter_context(patch.dict(server.os.environ, {'SCORD_SEED_DEMO_ROOMS': ''}))
        self.client = self.stack.enter_context(TestClient(server.app))

    def test_root_and_frontend_assets_serve_canonical_files(self):
        root = Path(server.__file__).parent
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/html', response.headers['content-type'])
        self.assertEqual(response.content, (root / 'index.html').read_bytes())
        for asset in ['app.js', 'static/p2p.js', 'static/social.js',
                      'static/community.js', 'static/design.js',
                      'static/style.css', 'static/design.css',
                      'static/settings.js', 'static/settings.css',
                      'static/server-menus.js', 'static/server-menus.css',
                      'static/chat-workspace.js', 'static/chat-workspace.css',
                      'static/profile-panel.js', 'static/profile-panel.css',
                      'static/reliable-dm.js', 'static/dm-workspace.css',
                      'static/ui-icons.js', 'static/ui-icons.css',
                      'static/ui-polish.css', 'static/workspace-polish.css']:
            with self.subTest(asset=asset):
                response = self.client.get('/' + asset)
                self.assertEqual(response.status_code, 200)
                self.assertNotIn('text/html', response.headers['content-type'])
                self.assertEqual(response.content, (root / asset).read_bytes())
        self.assertEqual(self.client.head('/').status_code, 200)

    def receive_type(self, socket, expected):
        # Bound unrelated frames so protocol changes fail clearly.
        for _ in range(12):
            message = socket.receive_json()
            if message.get('type') == expected:
                return message
        self.fail('Expected WebSocket frame: ' + expected)

    def test_two_peers_share_votes_and_reject_member_management(self):
        with self.client.websocket_connect('/ws/integration/owner') as owner:
            self.receive_type(owner, 'room_state')
            with self.client.websocket_connect('/ws/integration/member') as member:
                self.receive_type(member, 'room_state')
                owner.send_json({'type': 'community_action', 'action': 'create_poll',
                                 'title': 'Oyun?', 'options': ['Satranç', 'Go']})
                owner_state = self.receive_type(owner, 'community_state')
                member_state = self.receive_type(member, 'community_state')
                self.assertTrue(owner_state['can_manage'])
                self.assertFalse(member_state['can_manage'])
                poll_id = owner_state['polls'][0]['id']
                self.assertEqual(member_state['polls'][0]['id'], poll_id)

                for option, counts in [(0, [1, 0]), (1, [0, 1])]:
                    member.send_json({'type': 'community_action', 'action': 'vote',
                                      'id': poll_id, 'option': option})
                    owner_poll = self.receive_type(owner, 'community_state')['polls'][0]
                    member_poll = self.receive_type(member, 'community_state')['polls'][0]
                    self.assertEqual(owner_poll['counts'], counts)
                    self.assertEqual(member_poll['counts'], counts)
                    self.assertIsNone(owner_poll['my_vote'])
                    self.assertEqual(member_poll['my_vote'], option)
                    self.assertNotIn('votes', member_poll)

                saves_before = self.schedule_save.call_count
                for action in [{'action': 'close_poll', 'id': poll_id},
                               {'action': 'create_poll', 'title': 'Denied', 'options': ['A', 'B']},
                               {'action': 'create_event', 'title': 'Denied', 'description': '',
                                'starts_at': server.time.time() + 3600}]:
                    member.send_json({'type': 'community_action', **action})
                    self.assertTrue(self.receive_type(member, 'community_error')['message'])
                self.assertEqual(self.schedule_save.call_count, saves_before)
                self.assertEqual(len(self.room.community['polls']), 1)
                self.assertEqual(self.room.community['events'], [])
                self.assertFalse(self.room.community['polls'][0]['closed'])

                owner.send_json({'type': 'community_action', 'action': 'close_poll', 'id': poll_id})
                self.assertTrue(self.receive_type(owner, 'community_state')['polls'][0]['closed'])
                self.assertTrue(self.receive_type(member, 'community_state')['polls'][0]['closed'])
                member.send_json({'type': 'community_action', 'action': 'vote', 'id': poll_id, 'option': 0})
                self.receive_type(member, 'community_error')
                member.send_json({'type': 'community_get'})
                self.assertEqual(self.receive_type(member, 'community_state')['polls'][0]['counts'], [0, 1])


if __name__ == '__main__':
    unittest.main()
