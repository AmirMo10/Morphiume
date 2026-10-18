#!/usr/bin/env python3
"""Anonymous client-only checks, run on authorized Windows client46 after GO.

No Basic header, cookies, login, actor provisioning or database access.
"""
import argparse
import datetime
import http.client
import json


def check(host,status):
    connection=http.client.HTTPConnection('192.168.240.51',80,timeout=10)
    try:
        connection.connect()
        if connection.sock.getsockname()[0]!='192.168.240.46': raise ValueError('Unexpected client IP')
        connection.request('GET','/',headers={'Host':host,'Connection':'close'})
        response=connection.getresponse()
        if response.status!=status or response.getheader('WWW-Authenticate') is not None: raise ValueError('Unexpected anonymous perimeter response')
        return {'method':'GET','path':'/','host':host,'status':response.status,'authorizationSent':False,
                'cookiesSent':False,'clientIp':'192.168.240.46','basicChallenge':False}
    finally: connection.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__); parser.add_argument('--apply',action='store_true'); args=parser.parse_args()
    if not args.apply: return {'mode':'unexecuted-private-preview-client-check','httpRequests':0}
    rows=[check('192.168.240.51',200),check('unknown.morphiume.invalid',404)]
    return {'mode':'private-preview-basic-removal-client-accepted','observedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'requests':rows,'httpRequests':2,'appAdminAuthChanged':False,'unauthorizedClientTested':False,'ipv6ClientTested':False}


if __name__=='__main__':
    try: print(json.dumps(main()))
    except Exception:
        print(json.dumps({'mode':'private-preview-client-check-failed','automaticRetry':False}))
        raise SystemExit(1) from None
