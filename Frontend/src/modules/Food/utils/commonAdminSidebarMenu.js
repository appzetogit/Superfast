export const commonAdminSidebarMenu = [
  {
    type: "section",
    label: "Settings",
    permissionKey: "settings",
    items: [
      {
        type: "link",
        label: "App Settings",
        path: "/admin/global-settings/app",
        icon: "Settings",
        permissionKey: "settings",
      },
      {
        type: "link",
        label: "Admin Settings",
        path: "/admin/global-settings/admin",
        icon: "UserCog",
        permissionKey: "settings",
      },
      {
        type: "expandable",
        label: "Customization",
        icon: "Palette",
        permissionKey: "settings",
        subItems: [
          {
            label: "Modules",
            path: "/admin/global-settings/modules",
            icon: "LayoutGrid",
          }
        ]
      }
    ]
  },
  {
    type: "section",
    label: "Sub Admins",
    permissionKey: "subadmins",
    items: [
      {
        type: "link",
        label: "Manage Sub Admins",
        path: "/admin/global-settings/sub-admins",
        icon: "Users",
        permissionKey: "subadmins",
      }
    ]
  }
];
