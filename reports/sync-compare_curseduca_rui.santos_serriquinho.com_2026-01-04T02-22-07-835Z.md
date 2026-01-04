# Sync Compare Report

**GeneratedAt:** 2026-01-04T02:22:07.835Z
**Platform:** curseduca
**Email:** rui.santos@serriquinho.com
**Job:** Comparison Test

## Verdict
- User Equal: ❌
- UserProduct Equal: ❌

### User Diff
- **hotmart.engagement.calculatedAt**: `"2026-01-04T02:22:04.608Z"` → `"2026-01-04T02:22:06.368Z"`
- **curseduca.progress.estimatedProgress**: `undefined` → `2`
- **curseduca.progress.activityLevel**: `undefined` → `"LOW"`
- **curseduca.progress.groupEngagement**: `undefined` → `0`
- **curseduca.progress.progressSource**: `undefined` → `"estimated"`
- **curseduca.engagement.alternativeEngagement**: `undefined` → `0`
- **curseduca.engagement.activityLevel**: `undefined` → `"LOW"`
- **curseduca.engagement.engagementLevel**: `undefined` → `"NONE"`
- **curseduca.engagement.calculatedAt**: `undefined` → `"2026-01-04T02:22:06.368Z"`
- **curseduca.groupName**: `undefined` → `"Clareza - Mensal"`
- **combined.lastActivity**: `"2026-01-04T02:22:04.608Z"` → `"2026-01-04T02:22:06.368Z"`
- **combined.calculatedAt**: `"2026-01-04T02:22:04.615Z"` → `"2026-01-04T02:22:06.371Z"`
- **metadata.createdAt**: `"2026-01-04T02:22:04.608Z"` → `"2026-01-04T02:22:06.368Z"`
- **metadata.sources.curseduca.lastSync**: `"2026-01-04T02:22:04.701Z"` → `"2026-01-04T02:22:06.453Z"`


### UserProduct Diff
- **userId**: `"6959cecc8c84e192eeb63893"` → `"6959cece8c84e192eeb638af"`
- **engagement.lastLogin**: `"2025-12-26T09:44:44.000Z"` → `undefined`
- **engagement.engagementScore**: `undefined` → `4`
- **engagement.daysSinceLastLogin**: `undefined` → `null`
- **engagement.totalLogins**: `undefined` → `0`
- **engagement.lastAction**: `undefined` → `"2026-01-04T02:22:06.723Z"`
- **engagement.daysSinceLastAction**: `undefined` → `null`
- **engagement.actionsLastWeek**: `undefined` → `0`
- **engagement.actionsLastMonth**: `undefined` → `0`
- **metadata.purchaseValue**: `undefined` → `null`
- **metadata.purchaseDate**: `undefined` → `"2026-01-04T02:22:06.368Z"`
- **metadata.platform**: `undefined` → `"curseduca"`
- **progress.lastActivity**: `undefined` → `"2026-01-04T02:22:06.723Z"`
- **progress.modulesCompleted**: `undefined` → `[]`
- **progress.lessonsCompleted**: `undefined` → `[]`
- **platform**: `undefined` → `"curseduca"`
- **platformUserId**: `undefined` → `"305"`
- **enrolledAt**: `undefined` → `"2025-11-12T09:59:30.000Z"`


## Snapshots (sanitized)
<details><summary>Legacy User</summary>

```json
{
  "email": "rui.santos@serriquinho.com",
  "name": "Rui Santos",
  "discord": {
    "discordIds": [],
    "acceptedTerms": false,
    "isDeletable": true,
    "isDeleted": false,
    "role": "STUDENT",
    "priority": "MEDIUM",
    "locale": "pt_BR"
  },
  "hotmart": {
    "progress": {
      "totalTimeMinutes": 0,
      "completedLessons": 0,
      "lessonsData": []
    },
    "engagement": {
      "accessCount": 0,
      "engagementScore": 0,
      "engagementLevel": "NONE",
      "calculatedAt": "2026-01-04T02:22:04.608Z"
    },
    "plusAccess": "WITHOUT_PLUS_ACCESS",
    "enrolledClasses": []
  },
  "curseduca": {
    "progress": {},
    "engagement": {},
    "enrollmentsCount": 1,
    "memberStatus": "ACTIVE",
    "neverLogged": false,
    "situation": "ACTIVE",
    "enrolledClasses": [],
    "curseducaUserId": "305",
    "curseducaUuid": "6d42565a-bfc7-11f0-9b32-12eeaa0e8335",
    "groupId": "6",
    "joinedDate": "2025-11-12T09:59:30.000Z",
    "lastAccess": "2025-12-26T09:44:44.000Z",
    "lastLogin": "2025-12-26T09:44:44.000Z"
  },
  "combined": {
    "status": "ACTIVE",
    "totalProgress": 0,
    "totalTimeMinutes": 0,
    "totalLessons": 0,
    "combinedEngagement": 0,
    "bestEngagementSource": "estimated",
    "engagement": {
      "score": 0,
      "level": "MUITO_BAIXO",
      "sources": {
        "hotmart": 0,
        "curseduca": 0
      }
    },
    "allClasses": [],
    "lastActivity": "2026-01-04T02:22:04.608Z",
    "sourcesAvailable": [
      "discord",
      "hotmart",
      "curseduca"
    ],
    "dataQuality": "EXCELLENT",
    "calculatedAt": "2026-01-04T02:22:04.615Z"
  },
  "metadata": {
    "createdAt": "2026-01-04T02:22:04.608Z",
    "sources": {
      "curseduca": {
        "lastSync": "2026-01-04T02:22:04.701Z",
        "version": "3.1"
      }
    }
  },
  "communicationByCourse": {}
}
```

</details>
<details><summary>Universal User</summary>

```json
{
  "email": "rui.santos@serriquinho.com",
  "name": "Rui Santos",
  "discord": {
    "discordIds": [],
    "acceptedTerms": false,
    "isDeletable": true,
    "isDeleted": false,
    "role": "STUDENT",
    "priority": "MEDIUM",
    "locale": "pt_BR"
  },
  "hotmart": {
    "progress": {
      "totalTimeMinutes": 0,
      "completedLessons": 0,
      "lessonsData": []
    },
    "engagement": {
      "accessCount": 0,
      "engagementScore": 0,
      "engagementLevel": "NONE",
      "calculatedAt": "2026-01-04T02:22:06.368Z"
    },
    "plusAccess": "WITHOUT_PLUS_ACCESS",
    "enrolledClasses": []
  },
  "curseduca": {
    "progress": {
      "estimatedProgress": 2,
      "activityLevel": "LOW",
      "groupEngagement": 0,
      "progressSource": "estimated"
    },
    "engagement": {
      "alternativeEngagement": 0,
      "activityLevel": "LOW",
      "engagementLevel": "NONE",
      "calculatedAt": "2026-01-04T02:22:06.368Z"
    },
    "enrollmentsCount": 1,
    "memberStatus": "ACTIVE",
    "neverLogged": false,
    "situation": "ACTIVE",
    "enrolledClasses": [],
    "curseducaUserId": "305",
    "curseducaUuid": "6d42565a-bfc7-11f0-9b32-12eeaa0e8335",
    "groupId": "6",
    "groupName": "Clareza - Mensal",
    "joinedDate": "2025-11-12T09:59:30.000Z",
    "lastAccess": "2025-12-26T09:44:44.000Z",
    "lastLogin": "2025-12-26T09:44:44.000Z"
  },
  "combined": {
    "status": "ACTIVE",
    "totalProgress": 0,
    "totalTimeMinutes": 0,
    "totalLessons": 0,
    "combinedEngagement": 0,
    "bestEngagementSource": "estimated",
    "engagement": {
      "score": 0,
      "level": "MUITO_BAIXO",
      "sources": {
        "hotmart": 0,
        "curseduca": 0
      }
    },
    "allClasses": [],
    "lastActivity": "2026-01-04T02:22:06.368Z",
    "sourcesAvailable": [
      "discord",
      "hotmart",
      "curseduca"
    ],
    "dataQuality": "EXCELLENT",
    "calculatedAt": "2026-01-04T02:22:06.371Z"
  },
  "metadata": {
    "createdAt": "2026-01-04T02:22:06.368Z",
    "sources": {
      "curseduca": {
        "lastSync": "2026-01-04T02:22:06.453Z",
        "version": "3.1"
      }
    }
  },
  "communicationByCourse": {}
}
```

</details>
<details><summary>Legacy UserProduct</summary>

```json
{
  "userId": "6959cecc8c84e192eeb63893",
  "productId": "692f5c2a904878080a9f4ee6",
  "activeCampaignData": {
    "lists": [],
    "tags": []
  },
  "classes": [],
  "communications": {
    "emailsOpened": 0,
    "emailsSent": 0,
    "unsubscribed": false
  },
  "engagement": {
    "lastLogin": "2025-12-26T09:44:44.000Z"
  },
  "isPrimary": true,
  "metadata": {
    "refunded": false
  },
  "progress": {
    "percentage": 2
  },
  "source": "PURCHASE",
  "status": "ACTIVE"
}
```

</details>
<details><summary>Universal UserProduct</summary>

```json
{
  "userId": "6959cece8c84e192eeb638af",
  "productId": "692f5c2a904878080a9f4ee6",
  "platform": "curseduca",
  "platformUserId": "305",
  "enrolledAt": "2025-11-12T09:59:30.000Z",
  "status": "ACTIVE",
  "source": "PURCHASE",
  "progress": {
    "percentage": 2,
    "lastActivity": "2026-01-04T02:22:06.723Z",
    "modulesCompleted": [],
    "lessonsCompleted": []
  },
  "engagement": {
    "engagementScore": 4,
    "daysSinceLastLogin": null,
    "totalLogins": 0,
    "lastAction": "2026-01-04T02:22:06.723Z",
    "daysSinceLastAction": null,
    "actionsLastWeek": 0,
    "actionsLastMonth": 0
  },
  "activeCampaignData": {
    "tags": [],
    "lists": []
  },
  "communications": {
    "emailsSent": 0,
    "emailsOpened": 0,
    "unsubscribed": false
  },
  "isPrimary": true,
  "metadata": {
    "purchaseValue": null,
    "purchaseDate": "2026-01-04T02:22:06.368Z",
    "platform": "curseduca",
    "refunded": false
  },
  "classes": []
}
```

</details>
