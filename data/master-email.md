# Master-case email (sent after **each** param test activates its parser)

Same payload every time; a new run token is appended to the text body and `X-CTK-Token` header. The Email Parser Job for that send is deleted after the test finishes.

```
From:       Gauti Paswan <gautipaswan252@gmail.com>
To:         parserinboundemailhandler@c-olbes6va5s0zauuu5rsl162byfjrshkep6dge4nivvjsiibwh.g8-qgumzeaj.usa1142.apex.salesforce.com
CC:         gautipaswan252@gmail.com
Subject:    AUTO Master Test ORD-7788
X-CTK-Test: AUTO-HEADER-123
X-CTK-Token: <run token, also used to find the job>
Attachment: AUTO_Attached_Mail.eml  (content-type message/rfc822)
```

## Text Body

```
Hello Team,
Invoice: INV-1234
Amount: 25.60
Customer: Gauti Paswan
City: Noida
Regards,
Gauti
```

## HTML Body

```html
<div><table><tr><td>Invoice</td><td>INV-HTML-5566</td></tr>
<tr><td>Amount</td><td>99.99</td></tr></table></div>
```

## Nested .eml attachment

File: `data/emails/AUTO_Attached_Mail.eml`  
Subject inside: `AUTO Attached Mail INV-EML-9900`  
From: `gautipaswan252@gmail.com`  

Nodemailer attaches it with `contentType: message/rfc822` so Attachment File Names / Has Attachments filters can match `AUTO_Attached_Mail` / `.eml`.

## Values used by filters / field parsers

| Parameter | Sample / Contains value | Notes |
|--|--|--|
| From | `gautipaswan252@gmail.com` | From Name is separate |
| From Name | `Gauti Paswan` | |
| To | inbound address (CTK_INBOUND_ADDRESS) | |
| CC | `gautipaswan252@gmail.com` | same as From |
| Subject | `AUTO Master Test ORD-7788` | exactSubject – token is in body + X-CTK-Token |
| Header | name `X-CTK-Test`, value `AUTO-HEADER-123` | |
| Text Body | line `Invoice: INV-1234` | Filter ops in org: **Contains**, **Matches Regex** only |
| HTML Body | `INV-HTML-5566` | Not on Filter Source → skipped |
| Message Id | from job after send | Not on Filter Source → skipped |
| Attachments | Has Attachments | |
| Attachment File Names | `AUTO_Attached_Mail` / `.eml` | Field Parser Source label: **Attached File Names** |

Message Id is filled by Gmail / Salesforce when present; the suite reads it from the master job page into `test-results/master-job.json`. Email Send Date / Received Date scenarios were removed.
