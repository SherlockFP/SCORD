import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server


class CommunityTests(unittest.TestCase):
    def setUp(self):
        self.room = server.Room('test', 'Test', 'owner')

    def create_poll(self):
        server.community_action(self.room, 'owner', {'action':'create_poll','title':'Ne oynayalım?','options':['Satranç','Go']})
        return self.room.community['polls'][0]

    def test_member_cannot_create_or_close(self):
        with self.assertRaises(ValueError):
            server.community_action(self.room,'member',{'action':'create_poll'})
        poll=self.create_poll()
        with self.assertRaises(ValueError):
            server.community_action(self.room,'member',{'action':'close_poll','id':poll['id']})
        self.assertFalse(poll['closed'])

    def test_vote_replaces_previous_and_closed_rejects(self):
        poll=self.create_poll()
        for option in [0,0,1]:
            server.community_action(self.room,'member',{'action':'vote','id':poll['id'],'option':option})
        snapshot=server.community_snapshot(self.room,'member')
        self.assertEqual(snapshot['polls'][0]['counts'],[0,1])
        self.assertEqual(snapshot['polls'][0]['my_vote'],1)
        self.assertNotIn('votes',snapshot['polls'][0])
        server.community_action(self.room,'owner',{'action':'close_poll','id':poll['id']})
        with self.assertRaises(ValueError):
            server.community_action(self.room,'member',{'action':'vote','id':poll['id'],'option':0})

    def test_invalid_options_do_not_mutate(self):
        for options in [['Only one'],['Same','same'],['ok',123],['a','b']*4]:
            with self.assertRaises(ValueError):
                server.community_action(self.room,'owner',{'action':'create_poll','title':'Question','options':options})
        self.assertEqual(self.room.community['polls'],[])
        poll=self.create_poll()
        with self.assertRaises(ValueError):
            server.community_action(self.room,'member',{'action':'vote','id':poll['id'],'option':True})
        self.assertEqual(poll['votes'],{})

    def test_moderator_event_rsvp_idempotent_and_private(self):
        self.room.peer_roles['moderator']='mod'
        server.community_action(self.room,'moderator',{'action':'create_event','title':'Oyun gecesi','description':'Birlikte oynayalım','starts_at':server.time.time()+3600})
        event=self.room.community['events'][0]
        for _ in range(3):
            server.community_action(self.room,'member',{'action':'rsvp','id':event['id'],'attending':True})
        snapshot=server.community_snapshot(self.room,'member')['events'][0]
        self.assertEqual(snapshot['attendee_count'],1)
        self.assertTrue(snapshot['attending'])
        self.assertNotIn('attendees',snapshot)
        server.community_action(self.room,'member',{'action':'rsvp','id':event['id'],'attending':False})
        self.assertEqual(event['attendees'],[])

    def test_persistence_round_trip(self):
        self.create_poll()
        filename = Path(__file__).parent / ('community-test-' + server.uuid.uuid4().hex + '.json')
        try:
            with patch.object(server,'DATABASE_FILE',str(filename)), patch.object(server,'rooms',{'test':self.room}):
                server.save_db()
                self.assertTrue(filename.exists())
                server.rooms.clear()
                server.load_db()
                self.assertEqual(server.rooms['test'].community,self.room.community)
        finally:
            filename.unlink(missing_ok=True)

    def test_seed_rooms_opt_in_and_actual_presence_count(self):
        self.assertEqual(self.room.to_dict()['peer_count'], 0)
        with patch.object(server, 'load_db'), patch.object(server, 'ensure_template_rooms') as seed:
            with patch.dict(server.os.environ, {'SCORD_SEED_DEMO_ROOMS': ''}):
                server.startup_event()
                seed.assert_not_called()
            with patch.dict(server.os.environ, {'SCORD_SEED_DEMO_ROOMS': 'true'}):
                server.startup_event()
                seed.assert_called_once()

    def test_started_event_rejects_rsvp(self):
        self.room.community['events'].append({'id':'past', 'starts_at':0, 'attendees':[]})
        with self.assertRaises(ValueError):
            server.community_action(self.room,'member',{'action':'rsvp','id':'past','attending':True})

    def test_past_and_invalid_event_dates_rejected(self):
        for date in [0,True,'tomorrow',float('nan'),float('inf')]:
            with self.assertRaises(ValueError):
                server.community_action(self.room,'owner',{'action':'create_event','title':'Event','description':'Description','starts_at':date})
        self.assertEqual(self.room.community['events'],[])

if __name__=='__main__':
    unittest.main()
