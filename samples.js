
var app_id_key = k([ k("props", "app_id"), k("user_prefs", "app_id") ]);
exports = Sprint.wrap(BlackberrySelector, {
	props: {
		"blackberry_url": k("app", app_id_key, "blackberry_url"),
		"default_url": k("app", app_id_key, "default_url"),
	},
	actions: {
		"save": c("app", "save", {
			"app_id": app_id_key,
			"blackberry_url": k("app", app_id_key, "blackberry_url")
		})
	}
});

var user_id_key = k("props", "user_id");
exports = Sprint.wrap(TeamRow, {
	props: {
		"user": k("team", user_id_key)
	},
	actions: {
		"resend": c("team", "resendInviteEmail", { id: user_id_key })
	}
});

exports = Sprint.wrap(AutocompleteAndroid, {
	props: {
		"android_url": k("app", app_id_key, "android_url"),
		"autocomplete_items": k("autocomplete_android", k("state", "value"))
	}
});

exports = Sprint.wrap(ScreenMarketing, {
	props: {
		"links": k("link")
	}
});

exports = Sprint.wrap(ScreenMarketingRow, {
	props: {
		"links": k("link", k("props", "link_id"))
	}
});

exports = Sprint.wrap(InstallAnalyticsFilters, {
	props: {
		"filters": k("user_prefs", "install_analytics_filters"),
		"options": k("filter_options", "install_analytics_options")
	}
});

exports = Sprint.wrap(InstallAnalytics, {
	props: {
		"analytics": k("install_analytics", { "app_id": k("user_prefs", "app_id"), "time_range": k("user_prefs", "time_range"), "filters": k("user_prefs", "install_analytics_filters") })
	}
});
