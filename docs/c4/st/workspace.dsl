workspace {
    model {
        !include ../hmcts.mdsl
    }

    views {
        !include ../hmcts.vdsl

        systemContext st "st-context" {
            include *
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }

        container st "st-overview" {
            include *
            exclude idam
            exclude rpe
            exclude relationship==bsp->*
            autoLayout
        }
    }
}
