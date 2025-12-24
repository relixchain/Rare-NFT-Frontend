// src/app/router.jsx
import React from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";

import { HomePage } from "../pages/Home/HomePage";
import { CollectionPage } from "../pages/Collection/CollectionPage";
import { ItemPage } from "../pages/Item/ItemPage";
import { ProfilePage } from "../pages/Profile/ProfilePage";
import { MarketplacePage } from "../pages/Marketplace/MarketplacePage";

import { CreateNft } from "../pages/Create/CreateNft";
import { CreateCollection } from "../pages/Create/CreateCollection";

import { DashboardPage } from "../pages/dashboard/DashboardPage";
import { AdminGate } from "../components/admin/AdminGate";

import { NotFoundPage } from "../pages/NotFound/NotFoundPage";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      // Home
      { path: "/", element: <HomePage /> },

      // Browse
      { path: "/marketplace", element: <MarketplacePage /> },
      { path: "/collection/:address", element: <CollectionPage /> },
      { path: "/item/:address/:tokenId", element: <ItemPage /> },

      // Profile
      { path: "/profile", element: <ProfilePage /> },

      // Create (redirect hub -> nft)
      { path: "/create", element: <Navigate to="/create/nft" replace /> },
      { path: "/create/nft", element: <CreateNft /> },
      { path: "/create/collection", element: <CreateCollection /> },

      // Dashboard (Admin only)
      {
        path: "/dashboard",
        element: (
          <AdminGate>
            <DashboardPage />
          </AdminGate>
        ),
      },

      // If someone hits /dashboard/anything -> go /dashboard
      { path: "/dashboard/*", element: <Navigate to="/dashboard" replace /> },

      // 404
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
