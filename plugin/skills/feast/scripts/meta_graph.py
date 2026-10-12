#!/usr/bin/env python3
"""Meta Graph API helpers for what the Feastalytics tools don't cover yet.

Every command is one call from the agent's side. The token comes from
META_ACCESS_TOKEN and is sent only in the Authorization header, never in the
URL, so a vault placeholder works.

  check        token owner, ad account terms of service, pixels
  geo          search Meta's location keys (cities, zips, regions)
  targeting    get / set an ad set's targeting (set reads, merges, writes)
  audience     lookalike, website, engagement, customer-list, status, delete

Run any command with --help for its flags.
"""

import argparse
import csv
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

GRAPH = "https://graph.facebook.com/v24.0"
DAY_SECONDS = 86400
UPLOAD_BATCH = 10000
GEO_KINDS = ("countries", "regions", "cities", "zips", "custom_locations")
AUDIENCE_FIELDS = (
    "id,name,subtype,approximate_count_lower_bound,approximate_count_upper_bound,"
    "delivery_status,operation_status,time_updated,lookalike_spec,rule"
)


class GraphError(Exception):
    pass


def token():
    value = os.environ.get("META_ACCESS_TOKEN")
    if not value:
        raise GraphError(
            "META_ACCESS_TOKEN is not set. These scripts only work where Feastalytics "
            "provides the organization's Meta token (Feast agent sessions). Elsewhere, "
            "make this change in the dashboard or Meta Ads Manager."
        )
    return value


def graph(method, path, params=None, body=None):
    url = f"{GRAPH}/{path.lstrip('/')}"
    if params:
        url += "?" + urllib.parse.urlencode(
            {k: json.dumps(v) if isinstance(v, (dict, list)) else v for k, v in params.items()}
        )
    data = None
    if body is not None:
        data = urllib.parse.urlencode(
            {k: json.dumps(v) if isinstance(v, (dict, list)) else v for k, v in body.items()}
        ).encode()
    request = urllib.request.Request(
        url, data=data, method=method, headers={"Authorization": f"Bearer {token()}"}
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as err:
        payload = err.read()
        try:
            error = json.loads(payload).get("error", {})
        except ValueError:
            raise GraphError(f"HTTP {err.code}: {payload[:300]!r}")
        parts = [error.get("message", "")]
        if error.get("error_user_title") or error.get("error_user_msg"):
            parts.append(f"{error.get('error_user_title', '')}: {error.get('error_user_msg', '')}")
        parts.append(f"(code {error.get('code')}, subcode {error.get('error_subcode')})")
        raise GraphError(" ".join(p for p in parts if p))


def get_all(path, params):
    rows, after = [], None
    while True:
        page = graph("GET", path, {**params, **({"after": after} if after else {})})
        rows.extend(page.get("data", []))
        after = page.get("paging", {}).get("cursors", {}).get("after")
        if not after or not page.get("paging", {}).get("next"):
            return rows


def act(account):
    return "act_" + re.sub(r"^act_", "", account.strip())


def emit(value):
    print(json.dumps(value, indent=2, ensure_ascii=False))


def summarize_audience(a):
    return {
        "id": a.get("id"),
        "name": a.get("name"),
        "subtype": a.get("subtype"),
        "size": [a.get("approximate_count_lower_bound"), a.get("approximate_count_upper_bound")],
        "deliveryStatus": (a.get("delivery_status") or {}).get("description"),
        "readyForUse": (a.get("delivery_status") or {}).get("code") == 200,
        "operationStatus": (a.get("operation_status") or {}).get("description"),
        **({"lookalikeSpec": a["lookalike_spec"]} if a.get("lookalike_spec") else {}),
    }




def cmd_check(args):
    me = graph("GET", "me", {"fields": "id,name"})
    out = {"tokenUser": me}
    if args.account:
        account = graph(
            "GET",
            act(args.account),
            {"fields": "id,name,account_status,currency,timezone_name,tos_accepted,business{id,name}"},
        )
        pixels = get_all(f"{act(args.account)}/adspixels", {"fields": "id,name,last_fired_time", "limit": 50})
        out["adAccount"] = account
        out["customAudienceTermsAccepted"] = (account.get("tos_accepted") or {}).get("custom_audience_tos") == 1
        out["pixels"] = pixels
    emit(out)




def cmd_geo(args):
    params = {"type": "adgeolocation", "q": args.query, "limit": args.limit}
    if args.kind:
        params["location_types"] = [args.kind]
    if args.country:
        params["country_code"] = args.country
    rows = graph("GET", "search", params).get("data", [])
    emit(
        [
            {
                "key": r.get("key"),
                "name": r.get("name"),
                "type": r.get("type"),
                "region": r.get("region"),
                "countryCode": r.get("country_code"),
                "supportsRadius": r.get("supports_city") or r.get("type") in ("city", "place"),
            }
            for r in rows
        ]
    )




def read_adset(adset_id):
    return graph(
        "GET",
        adset_id,
        {"fields": "id,name,account_id,campaign_id,effective_status,targeting"},
    )


def summarize_targeting(adset):
    t = adset.get("targeting") or {}
    geo = t.get("geo_locations") or {}
    return {
        "adSet": {"id": adset.get("id"), "name": adset.get("name"), "status": adset.get("effective_status")},
        "geo": {k: geo[k] for k in (*GEO_KINDS, "location_types") if geo.get(k)},
        "excludedGeo": t.get("excluded_geo_locations"),
        "ageMin": t.get("age_min"),
        "ageMax": t.get("age_max"),
        "genders": t.get("genders"),
        "customAudiences": t.get("custom_audiences"),
        "excludedCustomAudiences": t.get("excluded_custom_audiences"),
        "interests": t.get("flexible_spec"),
        "advantageAudience": (t.get("targeting_automation") or {}).get("advantage_audience"),
        "publisherPlatforms": t.get("publisher_platforms"),
        "otherKeys": sorted(
            k
            for k in t
            if k
            not in {
                "geo_locations",
                "excluded_geo_locations",
                "age_min",
                "age_max",
                "genders",
                "custom_audiences",
                "excluded_custom_audiences",
                "flexible_spec",
                "targeting_automation",
                "publisher_platforms",
            }
        ),
    }


def parse_cities(values):
    cities = []
    for value in values:
        key, _, miles = value.partition(":")
        city = {"key": key}
        if miles:
            city.update({"radius": float(miles), "distance_unit": "mile"})
        cities.append(city)
    return cities


def parse_radius(value):
    try:
        lat, lng, miles = (float(x) for x in value.split(","))
    except ValueError:
        raise GraphError(f"--radius takes LAT,LNG,MILES, got {value!r}")
    return {"latitude": lat, "longitude": lng, "radius": miles, "distance_unit": "mile"}


def new_geo(args, current_geo):
    geo = {}
    if args.radius:
        geo["custom_locations"] = [parse_radius(r) for r in args.radius]
    if args.cities:
        geo["cities"] = parse_cities(args.cities)
    if args.zips:
        geo["zips"] = [{"key": z if ":" in z else f"US:{z}"} for z in args.zips]
    if args.regions:
        geo["regions"] = [{"key": r} for r in args.regions]
    if args.countries:
        geo["countries"] = args.countries
    if not geo:
        return None
    if current_geo.get("location_types"):
        geo["location_types"] = current_geo["location_types"]
    return geo


def audience_list(current, add, remove):
    ids = [a["id"] for a in (current or [])]
    for audience_id in add:
        if audience_id not in ids:
            ids.append(audience_id)
    ids = [i for i in ids if i not in set(remove)]
    return [{"id": i} for i in ids]


def merged_targeting(current, args):
    t = json.loads(json.dumps(current))
    geo = new_geo(args, t.get("geo_locations") or {})
    if geo is not None:
        t["geo_locations"] = geo
    if args.age_min is not None:
        t["age_min"] = args.age_min
    if args.age_max is not None:
        t["age_max"] = args.age_max
    if args.genders:
        if args.genders == "all":
            t.pop("genders", None)
        else:
            t["genders"] = [1] if args.genders == "male" else [2]
    for key, add, remove in (
        ("custom_audiences", args.include_audience, args.remove_audience),
        ("excluded_custom_audiences", args.exclude_audience, args.unexclude_audience),
    ):
        if add or remove:
            value = audience_list(t.get(key), add, remove)
            if value:
                t[key] = value
            else:
                t.pop(key, None)
    if args.advantage_audience is not None:
        t["targeting_automation"] = {**(t.get("targeting_automation") or {}), "advantage_audience": args.advantage_audience}
    for assignment in args.set or []:
        key, _, raw = assignment.partition("=")
        if not raw:
            raise GraphError(f"--set takes KEY=JSON, got {assignment!r}")
        value = json.loads(raw)
        if value is None:
            t.pop(key, None)
        else:
            t[key] = value
    return t


def changed_keys(before, after):
    return sorted(k for k in set(before) | set(after) if before.get(k) != after.get(k))


def cmd_targeting_get(args):
    emit([summarize_targeting(read_adset(i)) for i in args.adset_ids])


def cmd_targeting_set(args):
    results = []
    for adset_id in args.adset_ids:
        adset = read_adset(adset_id)
        before = adset.get("targeting") or {}
        after = merged_targeting(before, args)
        changed = changed_keys(before, after)
        if not changed:
            results.append({"adSetId": adset_id, "changed": [], "note": "nothing to change"})
            continue
        if args.dry_run:
            results.append(
                {
                    "adSetId": adset_id,
                    "dryRun": True,
                    "changed": changed,
                    "before": {k: before.get(k) for k in changed},
                    "after": {k: after.get(k) for k in changed},
                }
            )
            continue
        graph("POST", adset_id, body={"targeting": after})
        results.append({"adSetId": adset_id, "changed": changed, "now": summarize_targeting(read_adset(adset_id))})
    emit(results)




def create_audience(account, body):
    created = graph("POST", f"{act(account)}/customaudiences", body=body)
    return graph("GET", created["id"], {"fields": AUDIENCE_FIELDS})


def cmd_lookalike(args):
    if not 0.01 <= args.ratio <= 0.20:
        raise GraphError("--ratio is a share of the country, 0.01 (1%) to 0.20 (20%)")
    source = graph("GET", args.source, {"fields": "id,name,approximate_count_lower_bound"})
    name = args.name or f"Lookalike {int(args.ratio * 100)}% {args.country} of {source.get('name')}"
    audience = create_audience(
        args.account,
        {
            "name": name,
            "subtype": "LOOKALIKE",
            "origin_audience_id": args.source,
            "lookalike_spec": {"type": "custom_ratio", "ratio": args.ratio, "country": args.country},
        },
    )
    emit({"created": summarize_audience(audience), "source": source})


def cmd_website(args):
    filters = []
    if args.event:
        filters.append({"field": "event", "operator": "eq", "value": args.event})
    for fragment in args.url_contains or []:
        filters.append({"field": "url", "operator": "i_contains", "value": fragment})
    if not filters:
        filters.append({"field": "url", "operator": "i_contains", "value": ""})
    rule = {
        "inclusions": {
            "operator": "or",
            "rules": [
                {
                    "event_sources": [{"id": args.pixel, "type": "pixel"}],
                    "retention_seconds": args.days * DAY_SECONDS,
                    "filter": {"operator": "and", "filters": filters},
                }
            ],
        }
    }
    audience = create_audience(
        args.account,
        {"name": args.name, "rule": rule, "prefill": "1", **({"description": args.description} if args.description else {})},
    )
    emit({"created": summarize_audience(audience)})


ENGAGEMENT_EVENTS = {
    "page": {"all": "page_engaged", "messaged": "page_messaged", "cta": "page_cta_clicked"},
    "ig_business": {"all": "ig_business_profile_all", "messaged": "ig_user_messaged_business", "visited": "ig_business_profile_visit"},
}


def cmd_engagement(args):
    source_type = "page" if args.page else "ig_business"
    source_id = args.page or args.instagram
    event = ENGAGEMENT_EVENTS[source_type].get(args.action)
    if not event:
        raise GraphError(f"--action {args.action!r} is not valid for {source_type}; use one of {sorted(ENGAGEMENT_EVENTS[source_type])}")
    rule = {
        "inclusions": {
            "operator": "or",
            "rules": [
                {
                    "event_sources": [{"id": source_id, "type": source_type}],
                    "retention_seconds": args.days * DAY_SECONDS,
                    "filter": {"operator": "and", "filters": [{"field": "event", "operator": "eq", "value": event}]},
                }
            ],
        }
    }
    audience = create_audience(args.account, {"name": args.name, "rule": rule, "prefill": "1"})
    emit({"created": summarize_audience(audience)})


def normalize(column, value):
    value = (value or "").strip().lower()
    if not value:
        return ""
    if column == "PHONE":
        digits = re.sub(r"\D", "", value)
        return "1" + digits if len(digits) == 10 else digits
    if column == "EMAIL":
        return value if "@" in value else ""
    if column in ("FN", "LN"):
        return re.sub(r"[^a-z]", "", value)
    if column == "ZIP":
        return re.sub(r"\D", "", value)[:5]
    if column == "COUNTRY":
        return value[:2]
    return value


CSV_COLUMNS = {"phone": "PHONE", "email": "EMAIL", "first_name": "FN", "last_name": "LN", "zip": "ZIP", "country": "COUNTRY"}


def cmd_customer_list(args):
    with open(args.csv, newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        header = {h.strip().lower(): h for h in reader.fieldnames or []}
        columns = [c for c in CSV_COLUMNS if c in header]
        if "phone" not in columns and "email" not in columns:
            raise GraphError(f"The CSV needs a phone or email column. Recognized columns: {sorted(CSV_COLUMNS)}")
        schema = [CSV_COLUMNS[c] for c in columns]
        rows = []
        for record in reader:
            values = [normalize(CSV_COLUMNS[c], record.get(header[c])) for c in columns]
            if not any(values[i] for i, c in enumerate(columns) if c in ("phone", "email")):
                continue
            rows.append([hashlib.sha256(v.encode()).hexdigest() if v else "" for v in values])
    if not rows:
        raise GraphError("No row has a usable phone or email.")
    account = graph("GET", act(args.account), {"fields": "tos_accepted"})
    if (account.get("tos_accepted") or {}).get("custom_audience_tos") != 1:
        raise GraphError(
            f"The ad account has not accepted Meta's Custom Audience terms. The account owner accepts them at "
            f"https://business.facebook.com/ads/manage/customaudiences/tos/?act={act(args.account)[4:]}"
        )
    if args.audience:
        audience_id = args.audience
    else:
        audience_id = graph(
            "POST",
            f"{act(args.account)}/customaudiences",
            body={
                "name": args.name,
                "subtype": "CUSTOM",
                "customer_file_source": args.source,
                **({"description": args.description} if args.description else {}),
            },
        )["id"]
    received = 0
    for start in range(0, len(rows), UPLOAD_BATCH):
        batch = rows[start : start + UPLOAD_BATCH]
        result = graph("POST", f"{audience_id}/users", body={"payload": {"schema": schema, "data": batch}})
        received += result.get("num_received", 0)
    audience = graph("GET", audience_id, {"fields": AUDIENCE_FIELDS})
    emit({"audience": summarize_audience(audience), "rowsUploaded": len(rows), "rowsReceivedByMeta": received, "columns": schema})


def cmd_status(args):
    emit([summarize_audience(graph("GET", i, {"fields": AUDIENCE_FIELDS})) for i in args.audience_ids])


def cmd_delete(args):
    emit([{"id": i, **graph("DELETE", i)} for i in args.audience_ids])




def build_parser():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    check = commands.add_parser("check", help="token owner, and with --account: terms, pixels")
    check.add_argument("--account", help="ad account id (act_ optional)")
    check.set_defaults(run=cmd_check)

    geo = commands.add_parser("geo", help="search location keys for --cities / --zips / --regions")
    geo.add_argument("query")
    geo.add_argument("--kind", choices=["city", "zip", "region", "country", "neighborhood"])
    geo.add_argument("--country", default="US", help="two-letter country code (default US)")
    geo.add_argument("--limit", type=int, default=10)
    geo.set_defaults(run=cmd_geo)

    targeting = commands.add_parser("targeting", help="read or edit ad set targeting").add_subparsers(dest="action", required=True)
    tget = targeting.add_parser("get", help="current targeting of one or more ad sets")
    tget.add_argument("adset_ids", nargs="+")
    tget.set_defaults(run=cmd_targeting_get)
    tset = targeting.add_parser(
        "set",
        help="change targeting: reads the live spec, changes only what you pass, writes, re-reads",
        description=(
            "Geo flags together REPLACE the whole location (radius drops countries on purpose: Meta adds "
            "location kinds together, so a radius next to US still reaches the whole US). location_types is kept. "
            "Everything you don't pass is carried over unchanged."
        ),
    )
    tset.add_argument("adset_ids", nargs="+")
    tset.add_argument("--radius", action="append", metavar="LAT,LNG,MILES", help="a pin and radius in miles; repeatable")
    tset.add_argument("--cities", nargs="+", metavar="KEY[:MILES]", help="city keys from `geo --kind city`, optional radius")
    tset.add_argument("--zips", nargs="+", metavar="ZIP", help="5-digit zips (US assumed) or COUNTRY:ZIP keys")
    tset.add_argument("--regions", nargs="+", metavar="KEY", help="region (state) keys from `geo --kind region`")
    tset.add_argument("--countries", nargs="+", metavar="CC")
    tset.add_argument("--age-min", type=int)
    tset.add_argument("--age-max", type=int)
    tset.add_argument("--genders", choices=["all", "male", "female"])
    tset.add_argument("--include-audience", action="append", default=[], metavar="ID")
    tset.add_argument("--remove-audience", action="append", default=[], metavar="ID")
    tset.add_argument("--exclude-audience", action="append", default=[], metavar="ID")
    tset.add_argument("--unexclude-audience", action="append", default=[], metavar="ID")
    tset.add_argument("--advantage-audience", type=int, choices=[0, 1])
    tset.add_argument("--set", action="append", metavar="KEY=JSON", help="any other top-level targeting key; null removes it")
    tset.add_argument("--dry-run", action="store_true", help="show the changed keys before and after, write nothing")
    tset.set_defaults(run=cmd_targeting_set)

    audience = commands.add_parser("audience", help="create, inspect or delete custom audiences").add_subparsers(dest="action", required=True)

    lal = audience.add_parser("lookalike", help="lookalike of an existing custom audience")
    lal.add_argument("--account", required=True)
    lal.add_argument("--source", required=True, help="seed custom audience id (same ad account)")
    lal.add_argument("--country", default="US")
    lal.add_argument("--ratio", type=float, default=0.01, help="0.01 to 0.20 of the country (default 0.01)")
    lal.add_argument("--name")
    lal.set_defaults(run=cmd_lookalike)

    web = audience.add_parser("website", help="people who fired the pixel")
    web.add_argument("--account", required=True)
    web.add_argument("--pixel", required=True)
    web.add_argument("--name", required=True)
    web.add_argument("--days", type=int, default=30, help="lookback, 1 to 180 (default 30)")
    web.add_argument("--event", help="standard or custom event name, e.g. Lead, PageView")
    web.add_argument("--url-contains", action="append", help="page URL fragment; repeatable (all must match)")
    web.add_argument("--description")
    web.set_defaults(run=cmd_website)

    eng = audience.add_parser("engagement", help="people who engaged with a Facebook Page or Instagram account")
    eng.add_argument("--account", required=True)
    source = eng.add_mutually_exclusive_group(required=True)
    source.add_argument("--page", help="Facebook Page id")
    source.add_argument("--instagram", help="Instagram business account id")
    eng.add_argument("--action", default="all", help="all (default), messaged, cta (Page) or visited (Instagram)")
    eng.add_argument("--name", required=True)
    eng.add_argument("--days", type=int, default=365, help="lookback, 1 to 730 (default 365)")
    eng.set_defaults(run=cmd_engagement)

    cl = audience.add_parser("customer-list", help="upload hashed phones/emails from a CSV (new audience or --audience to add)")
    cl.add_argument("--account", required=True)
    cl.add_argument("--csv", required=True, help="columns: phone, email, first_name, last_name, zip, country")
    target = cl.add_mutually_exclusive_group(required=True)
    target.add_argument("--name", help="create a new audience with this name")
    target.add_argument("--audience", help="add rows to this existing customer-list audience")
    cl.add_argument("--source", default="USER_PROVIDED_ONLY", choices=["USER_PROVIDED_ONLY", "PARTNER_PROVIDED_ONLY", "BOTH_USER_AND_PARTNER_PROVIDED"])
    cl.add_argument("--description")
    cl.set_defaults(run=cmd_customer_list)

    status = audience.add_parser("status", help="size and readiness of audiences")
    status.add_argument("audience_ids", nargs="+")
    status.set_defaults(run=cmd_status)

    delete = audience.add_parser("delete", help="delete audiences (cannot be undone)")
    delete.add_argument("audience_ids", nargs="+")
    delete.set_defaults(run=cmd_delete)
    return parser


def main():
    args = build_parser().parse_args()
    try:
        args.run(args)
    except GraphError as err:
        print(f"error: {err}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
